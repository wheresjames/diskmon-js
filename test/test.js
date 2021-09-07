#!/usr/bin/env nodejs
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const dm = require('diskmon');

const Log = console.log;
const Fmt = JSON.stringify;
const Timer = secs => new Promise( res => setTimeout(res, secs*1000));

function mktmpfile(dir, name, add='')
{
    if (Array.isArray(name))
        for (let k in name)
            fs.writeFileSync(path.join(dir, `${name[k]}.txt`), `File: ${name[k]}.txt ${add}`, "utf8");
    else
        fs.writeFileSync(path.join(dir, `${name}.txt`), `File: ${name}.txt`, "utf8");
}

async function test_1()
{
    let tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'diskmon-'));

    if (!fs.existsSync(tmpdir))
        throw `Failed to create temp directory`;

    Log(`Using temp directory: ${tmpdir}`);

    // Create a few test files
    mktmpfile(tmpdir, ['test1', 'test2', 'test3']);

    //---------------------------------------------------------------
    // Initial scan
    let fstats = {};
    let opts = {filter: "test"};
    let change = dm.fileScan(tmpdir, fstats, opts);
    assert(!change);


    //---------------------------------------------------------------
    // Add file
    mktmpfile(tmpdir, ['test4']);
    change = dm.fileScan(tmpdir, fstats, opts);
    assert(change);

    // Make sure we get the new file
    let changed = dm.getChanged(fstats);
    Log('CREATED', changed);
    assert(1 === changed.length);
    assert(changed[0].scan == 2);
    assert(changed[0].name === 'test4.txt');
    assert(changed[0].created);
    assert(!changed[0].deleted);
    assert(!changed[0].changed);


    //---------------------------------------------------------------
    // Delete a file
    let df = path.join(tmpdir, 'test1.txt');
    assert(fs.existsSync(df));
    fs.unlinkSync(df);
    assert(!fs.existsSync(df));

    // Make sure we get the deleted file
    change = dm.fileScan(tmpdir, fstats, opts);
    assert(change);

    changed = dm.getChanged(fstats);
    Log('DELETED', changed);
    assert(1 === changed.length);
    assert(changed[0].scan == 3);
    assert(changed[0].name === 'test1.txt');
    assert(!changed[0].created);
    assert(changed[0].deleted);
    assert(!changed[0].changed);


    //---------------------------------------------------------------
    // Modify a file
    mktmpfile(tmpdir, ['test2'], ' - extra bytes');

    // Make sure we get the change
    change = dm.fileScan(tmpdir, fstats, opts);
    assert(change);

    changed = dm.getChanged(fstats);
    Log('CHANGED', changed);
    assert(1 === changed.length);
    assert(changed[0].scan == 4);
    assert(changed[0].name === 'test2.txt');
    assert(!changed[0].created);
    assert(!changed[0].deleted);
    assert(changed[0].changed);
    assert(changed[0].prev);


    //---------------------------------------------------------------
    // Ensure prev field goes away when deleted
    df = path.join(tmpdir, 'test2.txt');
    fs.unlinkSync(df);
    change = dm.fileScan(tmpdir, fstats, opts);
    assert(change);

    changed = dm.getChanged(fstats);
    Log('DELETED2', changed);
    assert(1 === changed.length);
    assert(changed[0].scan == 5);
    assert(changed[0].name === 'test2.txt');
    assert(!changed[0].created);
    assert(changed[0].deleted);
    assert(!changed[0].changed);
    assert(!changed[0].prev);


    //---------------------------------------------------------------
    // Wait on files to be three seconds old
    let start = Date.now() / 1000;
    let end = start;
    let gotFiles = false;
    let i = 0;
    while (6 > end - start)
    {
        process.stdout.write(`${i++}.`);
        change = dm.fileScan(tmpdir, fstats, opts);
        let aged = dm.filterByAge(fstats, 3);
        if (aged.length)
        {   gotFiles = true;
            Log(`\nGot files over three seconds old`);
            break;
        }

        await Timer(1);
        end = Date.now() / 1000;
    }
    assert(2 <= i);
    assert(gotFiles);

    // Cleanup test files
    Log(`Removing temp directory: ${tmpdir}`);
    fs.rmdirSync(tmpdir, { recursive: true });
}

async function test_2()
{
    let loop = 5;
    let fstats = {};
    while (loop--)
    {
        dm.fileScan(os.tmpdir(), fstats, {recursive:true});
        Log('-----------------------------------------');
        for (let k in fstats)
        {
            let v = fstats[k];
            if (v.isDir)
                Log(`${v.name} ${v.age}`);
        }
        await Timer(1);
    }
}

async function test_3()
{
    let tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'diskmon-'));

    if (!fs.existsSync(tmpdir))
        throw `Failed to create temp directory`;

    Log(`Using temp directory: ${tmpdir}`);

    let dir1 = path.join(tmpdir, 'dir1');
    fs.mkdirSync(dir1);
    mktmpfile(dir1, ['test1', 'test2', 'test3']);

    let dir2 = path.join(tmpdir, 'dir2');
    fs.mkdirSync(dir2);
    mktmpfile(dir2, ['test1', 'test2', 'test3']);

    //---------------------------------------------------------------
    // Initial scan
    let fstats = {};
    let opts = {path_filter: "dir1", recursive:true};
    dm.fileScan(tmpdir, fstats, opts);

    let checked = 0;
    let files = dm.filterByAge(fstats, 0);
    for (let k in files)
    {
        let v = files[k];
        if (v.isFile)
            checked++,
            Log(`${v.path} -> ${v.rpath} -> ${v.name}`),
            assert(path.join('dir1', v.name) == v.rpath);
    }
    assert(checked == 3);

    // Cleanup test files
    Log(`Removing temp directory: ${tmpdir}`);
    fs.rmdirSync(tmpdir, { recursive: true });

}

async function main()
{
    Log('--- STARTING TESTS ---\n');

    Log(dm.__info__);

    await test_1();
    // await test_2();
    await test_3();

    Log('--- DONE ---');
}

// Exit handling
process.on('exit',function() { Log('~ exit ~');});
process.on('SIGINT',function() { Log('~ keyboard ~'); process.exit(-1); });
process.on('uncaughtException',function(e) { Log('~ uncaught ~', e); process.exit(-1); });

// Run the program
main();

