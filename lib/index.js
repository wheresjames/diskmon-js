#!/usr/bin/env nodejs
'use strict';

const fs = require('fs');
const path = require('path');
const Log = console.log;

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
    filterByAge:    filterByAge,
    filterFiles:    filterFiles,
    countFiles:     countFiles,
    filter:         filter,
    count:          count
};

/** Scans the specified directory for changes
 * @param [in]      dir     - Directory to scan
 * @param [in/out]  fstats  - File states, pass the same array in each time.
 * @param [opts]    opts    - Options
 *                              filter          - File name filter
 *                                                  Examples: '.txt', /.*\.log$/
 *                              path_fillter    - File path filter
 *                                                  Examples: '.txt', 'dir', /\/var\/log.* /
 *                              recursive       - true to recurse into subdirectories
 *                              ignoreDeleted   - If set to true, deleted items will not be returned
 *                              notifyExisting  - Set to true to be notified of pre-existing files.
 * @param [in]      root    - Root path, relative path will be from this.
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
function fileScan(dir, fstats={}, opts={}, root=null, ts=0, st={})
{
    let totalChanged = 0;

    let filter = opts.filter;
    let path_filter = opts.path_filter;
    let recursive = opts.recursive;
    let ignoreDeleted = opts.ignoreDeleted;
    let notifyExisting = opts.notifyExisting;

    if (!ts)
        ts = Date.now() / 1000;

    // Combined directory information
    if (!st.size)
        st.size = 0;
    if (!st.ctime)
        st.ctime = -1;
    if (!st.mtime)
        st.mtime = -1;
    if (!st.lastChange)
        st.lastChange = -1;
    if (!st.age)
        st.age = -1;
    if (!st.numFiles)
        st.numFiles = 0;
    if (!st.numDirs)
        st.numDirs = 0;

    // Scan sub directories
    let dirlist;
    try {dirlist = fs.readdirSync(dir); }
    catch(e) { return 0; }

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

    for (let i = 0; i < dirlist.length; i++)
    {
        let name = dirlist[i];
        let rpath = root ? path.join(root, name) : name;
        let full = path.join(dir, name);
        let stat;

        // Apply filters
        if (filter && 0 > name.search(filter))
            continue;
        if (path_filter && 0 > full.search(path_filter))
            continue;

        try { stat = fs.lstatSync(full); }
        catch(e) { continue; }

        // Is it a directory
        if (stat.isDirectory())
        {
            if (!recursive)
                continue;

            try
            {
                let sst = {};
                let files = (name in fstats) ? fstats[name].files : {};
                totalChanged += fileScan(full, files, opts, rpath, ts, sst);
                if (Object.keys(files).length)
                {   st.numDirs += sst.numDirs;
                    st.numFiles += sst.numFiles;
                    if (-1 == sst.lastChange)
                        sst.lastChange = (name in fstats && 0 <= fstats[name].lastChange)
                                         ? fstats[name].lastChange
                                         : ts;
                    if (-1 == sst.age)
                        sst.age = ts - sst.lastChange;
                    fstats[name] = {
                        name:       name,
                        path:       full,
                        rpath:      rpath,
                        isDir:      true,
                        isFile:     false,
                        deleted:    false,
                        files:      files,
                        numFiles:   st.numFiles,
                        numDirs:    st.numDirs,
                        size:       sst.size,
                        ctime:      sst.ctime,
                        mtime:      sst.mtime,
                        lastChange: sst.lastChange,
                        age:        sst.age,
                        scan:       scan
                    };
                    st.size += sst.size;
                    if (0 > st.ctime || st.ctime > sst.ctime)
                        st.ctime = sst.ctime;
                    if (0 > st.mtime || st.mtime < sst.mtime)
                        st.mtime = sst.mtime;
                    if (0 > st.lastChange || st.lastChange > sst.lastChange)
                        st.lastChange = sst.lastChange;
                    if (0 > st.age || st.age > sst.age)
                        st.age = sst.age;
                }
            }
            catch(e) {Log(e);}
            continue;
        }

        // Fingerprint info
        let size = stat.size ? stat.size : 0;
        let ctime = stat.ctimeMs ? stat.ctimeMs / 1000 : 0;
        let mtime = stat.mtimeMs ? stat.mtimeMs / 1000 : 0;

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
                fstats[name].existed = false;
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
                fstats[name].existed = false;
                fstats[name].notified = false;
                fstats[name].lastChange = ts;
            }
            fstats[name].age = ts - fstats[name].lastChange;
            fstats[name].scan = scan;
        }

        // Add new entry
        else
        {
            if (!firstScan || notifyExisting)
                totalChanged++;

            fstats[name] = {
                name:       name,
                path:       full,
                rpath:      rpath,
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
                existed:    firstScan,
                notified:   firstScan && !notifyExisting
            };
        }

        // Track size / times
        st.numFiles++;
        let sst = fstats[name];
        st.size += sst.size;
        if (0 > st.ctime || st.ctime > sst.ctime)
            st.ctime = sst.ctime;
        if (0 > st.mtime || st.mtime < sst.mtime)
            st.mtime = sst.mtime;
        if (0 > st.lastChange || st.lastChange > sst.lastChange)
            st.lastChange = sst.lastChange;
        if (0 > st.age || st.age > sst.age)
            st.age = sst.age;
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
                fstats[k].existed = false;
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
                ret.push(v);
        }
    return ret;
}

/** Returns files that pass the filter function
 * @param [in] fstats   - File stats data
 * @param [in] f        - Function to filter files.
 *                          Return true to include file
 * @param [in] ret      - Array to add results to
*/
function filterFiles(fstats, f=null, ret=[])
{
    for (let k in fstats)
        if (fstats[k].isDir)
            filterFiles(fstats[k].files, f, ret);
        else if (fstats[k].isFile && (!f || f(fstats[k])))
            ret.push(fstats[k]);
    return ret;
}

/** Returns number of files that that pass the filter function
 * @param [in] fstats   - File stats data
 * @param [in] f        - Function to filter files.
 *                          Return true to count file
*/
function countFiles(fstats, f=null)
{
    let cnt = 0;
    for (let k in fstats)
        if (fstats[k].isDir)
            cnt += countFiles(fstats[k].files, f, ret);
        else if (fstats[k].isFile && (!f || f(fstats[k])))
            cnt++;
    return cnt;
}

/** Returns files and directories that pass the filter function
 * @param [in] fstats   - File stats data
 * @param [in] f        - Function to filter files and directories.
 *                          Return true to include file or directory
 * @param [in] ret      - Array to add results to
*/
function filter(fstats, f=null, ret=[])
{
    for (let k in fstats)
    {   if (!f || f(fstats[k]))
            ret.push(fstats[k]);
        if (fstats[k].isDir)
            filter(fstats[k].files, f, ret);
    }
    return ret;
}

/** Returns number of files and directories that that pass the filter function
 * @param [in] fstats   - File stats data
 * @param [in] f        - Function to filter files.
 *                          Return true to count file or directory
*/
function count(fstats, f=null)
{
    let cnt = 0;
    for (let k in fstats)
    {   if (!f || f(fstats[k]))
            cnt++;
        if (fstats[k].isDir)
            cnt += count(fstats[k].files, f);
    }
    return cnt;
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
                getChanged(v.files, minAge, ret);
            else if (!v.notified && v.age >= minAge)
            {   v.notified = true;
                ret.push(v);
                if (v.deleted)
                    delete fstats[k];
            }
        }
    return ret;
}
