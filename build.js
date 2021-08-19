#!/usr/bin/env nodejs
'use strict'

const fs = require('fs');
const path = require('path');
const Log = console.log;

function loadConfig(fname)
{   let r = {};
    let data = fs.readFileSync(fname, 'utf8');
    let lines = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    lines.forEach(v =>
        {   let parts = v.split(/\s+/);
            if (1 < parts.length)
            {   let k = parts.shift().trim().toLowerCase();
                r[k] = parts.join(' ');
            }
        });
    return r;
}

function processFile(cfg, fin, fout)
{
    let data = fs.readFileSync(fin, 'utf8');
    const rx = /(%.*?%)/g;

    let m;
    while((m = rx.exec(data)))
        if (0 <= m.index)
        {   let k = m[0].replace(/%/g, '').toLowerCase();
            if (k in cfg)
                data = data.slice(0, m.index) + cfg[k] + data.slice(m.index+m[0].length);
        }
    fs.writeFileSync(fout, data);
}

function parseParams(args, merge={})
{
    let r = {'*':[]}, ref = null;
    for (let k in args)
    {   let v = args[k];
        if (v[0] == '-')
        {   if (v[1] != '-')
                for (let i = 1; i < v.length; i++)
                    ref = v[i], r[ref] = true;
            else
            {   let eq = v.indexOf('=');
                if (0 > eq)
                    ref = v.slice(2), r[ref] = true;
                else
                    r[v.slice(2, eq)] = v.slice(eq + 1), ref = null;
            }
        }
        else if (ref)
            r[ref] = v, ref = null;
        else
            r['*'].push(v);
    }
    for (let k in merge)
    {   let v = merge[k];
        if ((k in r) && !(v in r))
            r[v] = r[k];
        else if (!(k in r) && (v in r))
            r[k] = r[v];
    }
    return r;
}

function fileCopy(src, dst, opts={overwrite:true, recursive:true, show:Log})
{
    if (!fs.existsSync(dst))
        fs.mkdirSync(dst);

    let dirlist = fs.readdirSync(src);
    for (let i = 0; i < dirlist.length; i++)
    {
        let name = dirlist[i];
        let fsrc = path.join(src, name);
        let fdst = path.join(dst, name);
        let status = '';
        if (!opts.overwrite && fs.existsSync(fdst))
            status = 'exists';
        else
        {
            let stat;
            try { stat = fs.lstatSync(fsrc); }
            catch(e) { if (opts.show) opts.show(e); continue; }
            if (stat.isDirectory())
            {   if (opts.recursive)
                    rCopy(fsrc, fdst);
            }
            else
                fs.copyFile(fsrc, fdst, (e) => { if (e && opts.show) opts.show(e) });
            status = 'copied';
        }
        if (status && opts.show)
            opts.show(`[${status}] ${fsrc} -> ${fdst}`);
    }
}

function createDox()
{
    return new Promise((resolve, reject)=>
    {
        let isDox = false;
        let doxygen = null;
        try { doxygen = require('doxygen'); }
        catch(e){ return reject(e); }

        Log("\Preparing doxygen...");

        let dcfg = path.join(dst, 'doxygen.cfg');
        return doxygen.downloadVersion()
            .then((data) =>
            {
                Log("\nGenerating Documentation...");
                var doxopts = {
                    PROJECT_NAME        : cfg.name,
                    OUTPUT_DIRECTORY    : path.join(src, 'dox'),
                    INPUT               : dst,
                    RECURSIVE           : "YES",
                    FILE_PATTERNS       : ["*.js"],
                    EXTENSION_MAPPING   : "js=Javascript",
                    GENERATE_LATEX      : "NO",
                    EXCLUDE_PATTERNS    : ["*/node_modules/*"]
                };
                doxygen.createConfig(doxopts, dcfg);
                return resolve(doxygen.run(dcfg));
            });
    });
}

function main()
{
    let _p = parseParams(process.argv, {'i':'install'});
    Log("Command", _p);

    let src = __dirname;
    let dst = path.join(src, 'dist');

    // Set working directory
    process.chdir(dst);

    // Delete output directory if it already exists
    if (fs.existsSync(dst))
        fs.rmdirSync(dst, { recursive: true });

    // Create new output directory
    fs.mkdirSync(dst);
    if (!fs.existsSync(dst))
        throw `Failed to create output directory : ${dst}`;

    // Load the config file
    let fcfg = path.join(src, 'PROJECT.txt');
    let cfg = loadConfig(fcfg);
    if (0 >= Object.keys(cfg).length)
        throw `Failed to load config: ${fcfg}`;

    // Create package file
    let pck_in = path.join(src, 'var', 'in.package.json');
    let pck_out = path.join(dst, 'package.json');
    processFile(cfg, pck_in, pck_out);
    if (!fs.existsSync(pck_out))
        throw `Failed to create package file : ${pck_out}`;

    // Copy source files
    fileCopy(path.join(src, 'src'), dst);
    fileCopy(path.join(src, 'test'), path.join(dst, 'test'));

    // Installing?
    Log("\nPackaging...");

    const cp = require('child_process');

    let cmd = `npm pack`;
    cp.exec(cmd, { cwd: dst }, (error, stdout, stderr) =>
        {
            Log(stdout);
            Log(stderr);

            // Did we get a package
            let npkg = `${cfg.name}-${cfg.version}.tgz`
            let fpkg = path.join(dst, npkg);
            if (!fs.existsSync(fpkg))
            {   Log(`Failed to create package : ${fpkg}`);
                return;
            }

            // Copy package file
            let dpkg = path.join(src, 'pkg', npkg);
            if (fs.existsSync(dpkg))
                fs.unlinkSync(dpkg);
            fs.renameSync(fpkg, dpkg);
            fs.copyFileSync(dpkg, path.join(src, 'pkg', `${cfg.name}-latest.tgz`));

            Log(`Created : ./pkg/${cfg.name}-latest.tgz -> ./pkg/${npkg}\n`);

            if (_p.install)
            {
                Log("\nInstalling...");
                let cmd = `sudo npm install -g ${dpkg}`;
                cp.exec(cmd, { cwd: dst }, (error, stdout, stderr) =>
                    {
                        Log(stdout);
                        Log(stderr);
                    });
            }
        });

}

// Exit handling
process.on('exit',function() {});
process.on('SIGINT',function() { Log('~ keyboard ~'); process.exit(-1); });
process.on('uncaughtException',function(e) { Log('~ uncaught ~', e); process.exit(-1); });

// Run the program
main();

