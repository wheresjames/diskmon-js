#!/usr/bin/env nodejs
'use strict';

const fs = require('fs');
const path = require('path');

function loadConfig(fname)
{   if (!fs.existsSync(fname))
        return {};
    let r = {};
    let data = fs.readFileSync(fname, 'utf8');
    let lines = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    lines.forEach(v =>
        {   v = v.trim();
            if ('#' != v[0])
            {   let parts = v.split(/\s+/);
                if (1 < parts.length)
                {   let k = parts.shift().trim().toLowerCase();
                    r[k] = parts.join(' ');
                }
            }
        });
    return r;
}

module.exports =
{
    __info__:       loadConfig(path.join(path.dirname(__dirname), 'PROJECT.txt')),
    fileScan:       fileScan,
    getChanged:     getChanged,
    filterByAge:    filterByAge
};

/** Scans the specified directory for changes
 * @param [in]      dir     - Directory to scan
 * @param [in/out]  fstats  - File states, pass the same array in each time.
 * @param [opts]    opts    - Options
 *                              filter          - File name filter
 *                                                  Examples: '.txt', /.*\.log$/
 *                              recursive       - true to recurse into subdirectories
 *                              ignoreDeleted   - If set to true, deleted items will not be returned
 * @param [in]      ts      - Timestamp, if not provided, the current time will be used
 *
 * @return Number of changes detected, will always return zero on first scan
 *
 * @begincode

    while (true)
    {
        fileScan("/tmp", fstats);
        Log(dm.getChanged(fstats));
    }

 * @endcode
*/
function fileScan(dir, fstats={}, opts={}, ts=0)
{
    let totalChanged = 0;

    let filter = opts.filter;
    let recursive = opts.recursive;
    let ignoreDeleted = opts.ignoreDeleted;

    if (!ts)
        ts = Date.now() / 1000;

    // Reset if the filter changes
    let sik = "_____-s-c-a-n-i-n-f-o-_____"
    if ((sik in fstats) && fstats[sik].filter != filter)
        fstats = {};

    // Scan information
    let firstScan = (sik in fstats) ? false : true;
    if (firstScan)
        fstats[sik] = {
                start:  ts,
                last:   ts,
                scan:   1,
                filter: filter
            };
    else
    {   fstats[sik].last = ts;
        fstats[sik].scan++;
    }
    let scan = fstats[sik].scan;

    // Scan sub directories
    let dirlist = fs.readdirSync(dir);
    for (let i = 0; i < dirlist.length; i++)
    {
        let name = dirlist[i];
        let full = path.join(dir, name);
        let stat;

        try { stat = fs.lstatSync(full); }
        catch(e) { continue; }

        // Is it a directory
        if (stat.isDirectory())
        {
            if (!recursive)
                continue;

            try
            {
                let files = (name in fstats) ? fstats[name].files : {};
                changed += fileScan(full, filter, opts, ts);
                if (Object.keys(files).length && !(name in fstats))
                    fstats[name] = {
                        name:       name,
                        path:       full,
                        isDir:      true,
                        isFile:     false,
                        files:      files
                    };
                fstats[name].scan = scan;

            }
            catch(e) {}
            continue;
        }

        // Apply filter
        if (filter && 0 > name.search(filter))
            continue;

        // Fingerprint info
        let size = stat.size ? stat.size : 0;
        let ctime = stat.ctimeMs ? stat.ctimeMs / 1000 : 0;
        let mtime = stat.mtimeMs ? stat.mtimeMs / 1000 : 0;
        let changed = false;

        // Exists?
        if (name in fstats)
        {
            // Was it undeleted?
            if (fstats[name].deleted)
            {   totalChanged++;
                if (fstats[name].prev)
                    delete fstats[name].prev;
                fstats[name].size = size;
                fstats[name].ctime = ctime;
                fstats[name].mtime = mtime;
                fstats[name].changed = false;
                fstats[name].deleted = false;
                fstats[name].created = true;
                fstats[name].notified = false;
                fstats[name].lastChange = ts;
            }

            // Has it changed?
            else if (size != fstats[name].size || ctime != fstats[name].ctime || mtime != fstats[name].mtime)
            {   totalChanged++;
                fstats[name].prev = {
                    size:  fstats[name].size,
                    ctime: fstats[name].ctime,
                    mtime: fstats[name].mtime
                };
                fstats[name].size = size;
                fstats[name].ctime = ctime;
                fstats[name].mtime = mtime;
                fstats[name].changed = true;
                fstats[name].deleted = false;
                fstats[name].created = false;
                fstats[name].notified = false;
                fstats[name].lastChange = ts;
            }
            fstats[name].age = ts - fstats[name].lastChange;
            fstats[name].scan = scan;
        }

        // Add new entry
        else
        {
            if (!firstScan)
                totalChanged++;

            fstats[name] = {
                name:       name,
                path:       full,
                size:       size,
                ctime:      ctime,
                mtime:      mtime,
                isDir:      false,
                isFile:     true,
                lastChange: ts,
                age:        0,
                scan:       scan,
                changed:    false,
                created:    !firstScan,
                deleted:    false,
                notified:   firstScan
            };
        }
    }

    // Scan for deleted items
    for (let k in fstats)
        if (fstats[k].isFile || fstats[k].isDir)
        {   let deleted = (fstats[k].scan != scan) ? true : false;
            if (ignoreDeleted && deleted)
                delete fstats[k];
            else if (fstats[k].deleted != deleted)
            {   totalChanged++;
                fstats[k].scan = scan;
                fstats[k].changed = false;
                fstats[k].created = !deleted;
                fstats[k].deleted = deleted;
                fstats[k].notified = false;
                if (fstats[k].prev)
                    delete fstats[k].prev;
            }
        }

    return totalChanged;
}

/** Returns files that have not changed since minAge
 * @param [in] fstats   - File stats data
 * @param [in] minAge   - Minimum time since last change in seconds
 * @param [in] ret      - Array to add results to
*/
function filterByAge(fstats, minAge, ret=[])
{
    for (let k in fstats)
        if (fstats[k].isFile || fstats[k].isDir)
        {   let v = fstats[k];
            if (v.isDir)
                filterByAge(v.files, minAge, ret);
            else if (v.age >= minAge)
            {   ret.push(v);
                if (v.deleted)
                    delete fstats[k];
            }
        }
    return ret;
}

/** Returns files that have changed flag set, this function clears the change flag
 * @param [in/out] fstats   - File stats data
 * @param [in] minAge       - Minimum time since last change in seconds
 * @param [in] ret          - Array to add results to
*/
function getChanged(fstats, minAge = 0, ret=[])
{
    for (let k in fstats)
        if (fstats[k].isFile || fstats[k].isDir)
        {   let v = fstats[k];
            if (v.isDir)
                getChanged(v.files, ret);
            else if (!v.notified && v.age >= minAge)
            {   v.notified = true;
                ret.push(v);
                if (v.deleted)
                    delete fstats[k];
            }
        }
    return ret;
}
