# Sonderplan Import Contacts from FarmersWife

## Overview

With this script, you can take a FarmersWife Contacts CSV export file and import it into your [Sonderplan](https://www.sonderplan.com) account.

## Dependencies
* NodeJS

## Run the script

1. Run `npm install` to install the dependencies
2. Copy your compatible CSV file into the private folder, and edit the file location specified in the constant `csvFilePath`
3. Generate an API key in the [Sonderplan Integrations Interface](https://docs.sonderplan.com/en/admin/api-clients), and copy it into the script in the constant `apiKey`
4. From the command line run `node import.js` to start the script importing
