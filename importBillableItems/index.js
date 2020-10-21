'use strict'
const csvtojson = require("csvtojson");
const fs = require('fs');
const request = require('superagent');
const csvFilePath = 'private/sample.csv';
const apiKey = 'YOUR_API_KEY HERE';

// Define the CSV structure below
const billableItemsExport = {
    "common": [
        {
            "key": "name",
            "val": "Item Name",
        },
        {
            "key": "description",
            "val": "Description"
        },
        {
            "key": "unit_name",
            "val": "Unit Name"
        },
        {
            "key": "cost",
            "val": "Cost ($)"
        },
        {
            "key": "default_tax",
            "val": "Taxable",
            "transform": function (x) {
                // Returns true if the value is exactly the string TRUE, else false
                return x === 'TRUE';
            }
        },
        {
            "key": "custom_fields",
            "val": "Location",
            "transform": function (x) {
                return {"1_10_XXX": x}; // Specify a custom field update key here
            }
        }
    ]
};

/**
 * The main handler for the import script
 *
 * @param event
 * @returns {Promise<void>}
 */
exports.handler = async (event) => {
    // Retrieve our CSV and populate jsonArray
    const jsonArray = await csvtojson().fromFile(csvFilePath);
    let billableItems = [];

    // Iterate through each line of the CSV
    jsonArray.forEach(function (line, lineIndex) {
        let billableItem = {};
        let transformRecipe = billableItemsExport.common;

        // Iterate through each attribute of our transformation recipe
        transformRecipe.forEach(object => {

            // If we have a transformation function defined
            if (typeof (object.transform) !== "undefined") {

                // If this isn't a custom_field, we can just run the transformation
                if (object.key !== "custom_fields") {
                    billableItem[object.key] = object.transform(line[object.val]);
                } else {
                    // This is a custom_field, check that we don't already have any custom_fields defined so we can do a straight insert
                    if (typeof (billableItem.custom_fields) === 'undefined') {
                        billableItem[object.key] = object.transform(line[object.val]);
                    // We do have custom fields defined, so get the existing custom_fields, and merge our object with the existing object
                    } else {
                        billableItems[object.key] = Object.assign(billableItem.custom_fields, object.transform(line[object.val]));
                    }
                }
            // No transformation, nice and easy, just do a straight copy of the value
            } else {
                billableItem[object.key] = line[object.val];
            }
        });

        // Push this item onto the end of the billable items array
        billableItems.push(billableItem);
    });

    let billableItemsResult = await createBillableItems(billableItems);

    console.log(billableItemsResult);
}

/**
 * Loops through each of the billable items and send to the API for insertion
 *
 * @param billableItems
 * @returns {Promise<boolean>}
 */
async function createBillableItems(billableItems) {
    for (const item of billableItems) {
        console.log(item);
        await writeToApi('/billableitem', item);
    }
    return true;
}

/**
 * Writes an object to the FoxOMS API at the specified endpoint
 *
 * @param endpoint
 * @param object
 * @param callback
 * @returns {Promise<unknown>}
 */
function writeToApi(endpoint, object, callback) {
    request
        .post('https://api.foxoms.com/v1' + endpoint)
        .send(object)
        .set('Authorization', 'Bearer ' + apiKey)
        .set('Accept', 'application/json')
        //.disableTLSCerts()  // For Development Use Only
        .end(function (err, response) {
            if (err) {
                let errorMsg = '\n------\n' +
                    'Failed to create:\n' +
                    JSON.stringify(object) + '\n' +
                    'Error returned:\n' +
                    JSON.stringify(response.body) +
                    '\n------\n';

                console.log(errorMsg);

                // Write all errors to the file system
                fs.appendFileSync('error.txt', errorMsg);
            } else {
                console.log(response.body);
            }
        });

    return new Promise(resolve => setTimeout(resolve, 1000)); // Delay our return by 1 sec to stay under the API request limits
}

// Run our main handler
exports.handler();
