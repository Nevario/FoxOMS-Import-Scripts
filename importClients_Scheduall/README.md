# FoxOMS Import Scheduall Agency & Client Script

## Overview

With this script, you can take a Scheduall Agency & Client CSV export file and import it into your FoxOMS account.

## Dependencies
* NodeJS

## Run the script

1. Run `npm install` to install the dependencies
2. Copy your compatible CSV file into the private folder, and edit the file location specified in the constant `csvFilePath`
3. Generate an API key in the [FoxOMS Admin Interface](https://foxdocs.foxoms.com/administration/api-keys/#create-edit-an-api-key), an copy it into the script in the constant `apiKey`
4. From the command line run `node index.js` to start the script importing
