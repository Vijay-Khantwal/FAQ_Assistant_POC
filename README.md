# POC for FAQ-Assistant App
<br>

**For running the App, replace the main App file of a standard Rocket.Chat App starter template code with given files.**

Three separate App files are there. Will have to test individually.

Add permissions in app.json (excluding default permissions which will also be needed to add manually) :- ui.registerButtons, ui.interact

**For using settings.ts file do the following steps:-**
1. Import settings.ts into the main App file.
```

import {settings} from './settings.ts';

```
2. Register the settings by adding the following code:-
```
public async extendConfiguration(configuration: IConfigurationExtend) {
        await Promise.all([
            ...settings.map((setting) =>
                configuration.settings.provideSetting(setting)
            ),
        ]);
    }
```
