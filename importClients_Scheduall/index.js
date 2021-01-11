'use strict'
const csvtojson = require("csvtojson");
const fs = require('fs');
const request = require('superagent');
const csvFilePath = 'private/scheduall-agency-client-export.csv';
const apiKey = 'YOUR_API_KEY HERE';

// Define the CSV structure below
const scheduallAgencyClientExport = {
    "person": [
        {
            "key":"first_name",
            "val":"NAME",
            "transform": function(x) {
                return x.split(' ').slice(0, -1).join(' ');
            }
        },
        {
            "key":"last_name",
            "val":"NAME",
            "transform": function(x) {
                return x.split(' ').slice(-1).join(' ');
            }
        },
        {
            "key":"primary_email",
            "val":"EMAILADDR"
        }
    ],
    "organization": [
        {
            "key":"name",
            "val":"NAME"
        },
        {
            "key":"email_1",
            "val":"EMAILADDR"
        }
    ],
    "common" : [
        {
            "key":"email_2",
            "val":"ALTEMAILAD"
        },
        {
            "key":"phone_1",
            "val":"PH1"
        },
        {
            "key":"phone_2",
            "val":"PH2"
        },
        {
            "key":"address_line_1",
            "val":"ADDRESS"
        },
        {
            "key":"address_city",
            "val":"CITY"
        },
        {
            "key":"address_state",
            "val":"STATE"
        },
        {
            "key":"address_postcode",
            "val":"ZIP"
        },
        {
            "key":"notes",
            "val":"NTS"
        },
        {
            "key":"website",
            "val":"WEBSITE"
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
    const jsonArray = await csvtojson().fromFile(csvFilePath);
    let people = [];
    let organizations = [];

    jsonArray.forEach(function(line, lineIndex) {

        let client = {};
        let transformRecipe;
        let clientType;

        // If this is an organization
        if(line['CLIENTTYPE'] === "2" || line['CLIENTTYPE'] === "0") {
            clientType = 'organization';
            transformRecipe = scheduallAgencyClientExport.organization.concat(scheduallAgencyClientExport.common);
        } else {
            clientType = 'person';
            transformRecipe = scheduallAgencyClientExport.person.concat(scheduallAgencyClientExport.common);
        }

        transformRecipe.forEach(object => {
            if(typeof(object.transform) !== "undefined") {
                client[object.key] = object.transform(line[object.val]);
            } else {
                client[object.key] = line[object.val];
            }
        });

        if(clientType === 'person') {
            people.push(client);
        } else if(clientType === 'organization') {
            organizations.push(client);
        }
    });

    let peopleResult = await createPeople(people);
    let organizationResult = await createOrganizations(organizations);

    console.log(peopleResult);
    console.log(organizationResult);
}

/**
 * Loops through each of the contacts identified as people and send to the API for insertion
 *
 * @param people
 * @returns {Promise<boolean>}
 */
async function createPeople(people) {
    for(const person of people) {
        await writeToApi('/people', person);
    }
    return true;
}

/**
 * Loops through each of the contacts identified as organizations and send to the API for insertion
 *
 * @param organizations
 * @returns {Promise<boolean>}
 */
async function createOrganizations(organizations) {
    for(const organization of organizations) {
        await writeToApi('/organization', organization);
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
        //.disableTLSCerts() For development use only
        .end(function(err, response) {
            if(err) {
                let errorMsg = '\n------\n' +
                    'Failed to create:\n' +
                    JSON.stringify(object) + '\n' +
                    'Error returned:\n' +
                    JSON.stringify(response.body) +
                    '\n------\n';

                console.log(errorMsg);

                fs.appendFileSync('error.txt', errorMsg);
            } else {
                console.log(response.body);
            }
        });

    return new Promise(resolve => setTimeout(resolve, 1000)); // Delay our return by 1 sec to stay under the API request limits
}

// Run our main handler
exports.handler();
