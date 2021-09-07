
# diskmon

Groups list items using a compare function.

``` javascript

    const dm = require('diskmon');

    let fstats = {};
    for(;;)
    {
        let change = dm.fileScan('/tmp', fstats, {filter: '.txt'});
        if (change)
        {
            let changed = dm.getChanged(fstats);
            if (changed.length)
                if (changed[0].created)
                    Log(`[CREATED] ${changed[0].name} {size=${changed[0].size}}`);
                else if (changed[0].deleted)
                    Log(`[DELETED] ${changed[0].name} {size=${changed[0].size}}`);
                else if (changed[0].changed)
                    Log(`[CHANGED] ${changed[0].name} {size=${changed[0].size}}`);
        }
        await Sleep(1);
    }

```

---------------------------------------------------------------------
## Table of contents

* [Install](#install)
* [Examples](#examples)
* [References](#references)

&nbsp;

---------------------------------------------------------------------
## Install

    $ npm install diskmon

&nbsp;


---------------------------------------------------------------------
## Examples

``` javascript

    'use strict';

    const dm = require('diskmon');

    const Log = console.log;
    const Fmt = JSON.stringify;
    const Sleep = secs => new Promise( res => setTimeout(res, secs*1000));

    async function main()
    {
        let fstats = {};
        for(;;)
        {
            let change = dm.fileScan('/tmp', fstats, {filter: '.txt'});
            if (change)
            {
                let changed = dm.getChanged(fstats);
                if (changed.length)
                    if (changed[0].created)
                        Log(`[CREATED] ${changed[0].name} {size=${changed[0].size}}`);
                    else if (changed[0].deleted)
                        Log(`[DELETED] ${changed[0].name} {size=${changed[0].size}}`);
                    else if (changed[0].changed)
                        Log(`[CHANGED] ${changed[0].name} {size=${changed[0].size}}`);
            }
            await Sleep(1);
        }
    }

    main();

```

&nbsp;


---------------------------------------------------------------------
## References

- Node.js
    - https://nodejs.org/

- npm
    - https://www.npmjs.com/

