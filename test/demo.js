#!/usr/bin/env nodejs
'use strict';

const dm = require('diskmon');

const Log = console.log;
const Fmt = JSON.stringify;
const Sleep = secs => new Promise(res => setTimeout(res, secs*1000));

async function main()
{
    Log(`Monitoring (${dm.__info__.version})...`);

    let fstats = {};
    for(;;)
    {
        let change = dm.fileScan('/tmp', fstats, {notifyExisting:true});
        if (change)
        {
            let changed = dm.getChanged(fstats);
            for (let k in changed)
            {
                let v = changed[k];
                if (v.created)
                    Log(`[CREATED] ${v.name} {size=${v.size}}`);
                else if (v.deleted)
                    Log(`[DELETED] ${v.name} {size=${v.size}}`);
                else if (v.changed)
                    Log(`[CHANGED] ${v.name} {size=${v.size}}`);
                else if (v.existed)
                    Log(`[EXISTED] ${v.name} {size=${v.size}}`);
            }
        }
        await Sleep(1);
    }
}

main();