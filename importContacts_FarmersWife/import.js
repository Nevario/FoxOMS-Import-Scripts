'use strict'
const csvtojson = require("csvtojson");
const request = require('superagent');
const Throttle = require('superagent-throttle');
const csvFilePath = 'private/FW_Export_Contacts.csv';
const apiKey = '******';
const apiUrl = 'https://api-dev.sonderplan.com/v2';

const fwIdField = 'custom_field_313'; // Specify custom field for tracking the FarmersWife ID
const categoryField = 'custom_field_312'; // Specify custom field for tracking the Contact Category

const newCount = {
    contacts: 0
}

// Set up the throttle plugin
const throttle = new Throttle({
    active: true,        // set false to pause queue
    rate: 2,             // how many requests can be sent every `ratePer`
    ratePer: 1000,       // number of ms in which `rate` requests may be sent
    concurrent: 1        // how many requests can be sent concurrently
});

exports.handler = async () => {
    try {
        const jsonArray = await csvtojson().fromFile(csvFilePath);
        const contacts = [];
        const organizations = [];

        console.log('jsonArray', jsonArray);

        for (const line of jsonArray) {

            const contact = {
                name: line['First Name'] + ' ' + line['Last Name'],
                email_1: line['Email'],
                phone_1: line['Phone Work'],
                phone_2: line['Phone Mobile'],
                address_line_1: line['Address'],
                website: line['WWW'],
                notes: 'Title: ' + line['Title'],
                type: 'person'
            }

            contact[fwIdField] = line['ID'];
            contact[categoryField] = line['Category'];

            if(line['Company'].length > 0) {
                // Check for existing organization entry in organizations array of object
                const existingOrg = organizations.find(company => company.name === line['Company'].toLowerCase());

                if(existingOrg) {
                    // If it exists, return the organization id
                    contact['org_id'] = existingOrg.id;
                } else {

                }



                // Else create the org and add to our array of objects
            }

            contacts.push(contact);
        }

        const sonderplanContacts = await createOrUpdateContacts(contacts);

        console.log('contacts', sonderplanContacts);


    } catch (error) {
        console.error('Error in handler:', error);
    }
}

/**
 * Creates or updates contacts
 *
 * @param contacts
 * @return {Promise<*>}
 */
async function createOrUpdateContacts(contacts){
    const existingClients = await getExistingClientContacts();

    for (const contact of contacts) {
        if(contact.name.length === 0) {
            continue;
        }
        const existingClient = existingClients.find(ec => ec.name === contact.name);
        if (existingClient) {
            contact.uuid = existingClient.uuid;
            await updateContact(contact, contact.uuid);
        } else {
            newCount.contacts++;
            contact.client = true;

            const newContactId = await createContact(contact);
            contact.id = parseInt(newContactId);
            existingClients.push(contact)
        }
    }

    return contacts;
}

/**
 * Retrieves existing client contacts from server
 *
 * @returns {Promise<*|boolean>}
 */
async function getExistingClientContacts() {
    try {
        const response = await request
            .get(`${apiUrl}/contact?fields=uuid,name,client,type&client=true&limit=1000`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            .disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send();
        return response.body.data;
    } catch (error) {
        console.error(error);
        return false;  // Return false if the API call fails
    }
}

/**
 * Create single contact
 *
 * @param singleContact
 * @returns {Promise<*|boolean>}
 */
async function createContact(singleContact) {
    try {
        console.log('create contact', singleContact);
        const response = await request
            .post(`${apiUrl}/contact`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            .disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send(singleContact);
        return response.body.success.id;
    } catch (error) {
        console.error('Failed to create new contact:', error);
        return false;  // Return false if the API call fails
    }
}

/**
 * Create single contact
 *
 * @param singleContact
 * @param uuid
 * @returns {Promise<*|boolean>}
 */
async function updateContact(singleContact, uuid) {
    try {
        console.log('update contact', singleContact);
        const response = await request
            .post(`${apiUrl}/contact?uuid=${uuid}`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            .disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send(singleContact);
        return response.body.success.id;
    } catch (error) {
        console.error('Failed to create new contact:', error);
        return false;  // Return false if the API call fails
    }
}

// Run our main handler
exports.handler();
