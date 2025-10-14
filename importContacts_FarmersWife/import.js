'use strict'
const csvtojson = require("csvtojson");
const request = require('superagent');
const Throttle = require('superagent-throttle');
const csvFilePath = 'private/farmerswife-contacts-export.csv';
const apiKey = 'YOUR_API_KEY_HERE';
const apiUrl = 'https://api.sonderplan.com/v2';

const fwIdField = 'custom_field_XXX'; // Specify custom field for tracking the FarmersWife ID
const categoryField = 'custom_field_XXX'; // Specify custom field for tracking the Contact Category

const newCount = {
    contacts: 0,
    organizations: 0
}

// Set up the throttle plugin
const throttle = new Throttle({
    active: true,        // set false to pause queue
    rate: 2,             // how many requests can be sent every `ratePer`
    ratePer: 1000,       // number of ms in which `rate` requests may be sent
    concurrent: 1        // how many requests can be sent concurrently
});

const normalize = (s) => (s || '').toString().trim().toLowerCase();

exports.handler = async () => {
    try {
        const jsonArray = await csvtojson().fromFile(csvFilePath);

        // caches
        const contacts = [];
        const organizations = []; // orgs created during this run
        const orgIndex = new Map(); // lcName -> { id, name }

        // seed index with orgs that already exist server-side
        const existingOrganizations = await getExistingOrganizations(); // [{id,name,type}, ...]
        if (Array.isArray(existingOrganizations)) {
            for (const org of existingOrganizations) {
                if (org?.name && org?.id) {
                    orgIndex.set(normalize(org.name), { id: org.id, name: org.name });
                }
            }
        }

        for (const line of jsonArray) {
            const contact = {
                name: `${line['First Name'] || ''} ${line['Last Name'] || ''}`.trim(),
                email_1: line['Email'],
                phone_1: line['Phone Work'],
                phone_2: line['Phone Mobile'],
                address_line_1: line['Address'],
                website: line['WWW'],
                notes: `Title: ${line['Title'] || ''}`.trim(),
                type: 'person'
            };

            contact[fwIdField] = line['ID'];
            contact[categoryField] = line['Category'];

            const companyRaw = (line['Company'] || '').toString().trim();
            if (companyRaw.length > 0) {
                const lc = normalize(companyRaw);

                // 1) check index (server-seeded + run-local)
                let org = orgIndex.get(lc);

                // 2) fallback to local array just in case
                if (!org) {
                    const existingLocal = organizations.find(o => normalize(o.name) === lc);
                    if (existingLocal) org = existingLocal;
                }

                // 3) create if still missing
                if (!org) {
                    const orgId = await createOrganization({
                        name: companyRaw,
                        type: 'organization'
                    });

                    if (orgId) {
                        org = { id: parseInt(orgId, 10), name: companyRaw };
                        organizations.push(org);
                        orgIndex.set(lc, org);
                        newCount.organizations++;
                        console.log('created organization', org);
                    } else {
                        console.warn(`Failed to create organization for "${companyRaw}" – leaving contact without org_id`);
                    }
                }

                // attach org_id if available
                if (org?.id) {
                    contact['linked_organization_id'] = org.id;
                }
            }

            contacts.push(contact);
        }

        const sonderplanContacts = await createOrUpdateContacts(contacts);

        console.log('new counts', newCount);
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
        if(!contact.name || contact.name.length === 0) continue;
        const existingClient = existingClients?.find(ec => ec.name === contact.name);

        if (existingClient) {
            contact.uuid = existingClient.uuid;
            await updateContact(contact, contact.uuid);
        } else {
            newCount.contacts++;
            contact.client = true;

            const newContactId = await createContact(contact);
            if (newContactId) {
                contact.id = parseInt(newContactId, 10);
                existingClients?.push?.(contact);
            }
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
 * Retrieve existing organizations from server.
 *
 * @returns {Promise<Array|false>}
 */
async function getExistingOrganizations() {
    try {
        const response = await request
            .get(`${apiUrl}/contact?fields=id,name,type&limit=1000&type=organization`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            .disableTLSCerts() // For development use only
            .use(throttle.plugin())
            .send();

        const data = response.body.data || [];
        return data.filter(x => x?.type === 'organization');
    } catch (error) {
        console.error('Failed to fetch existing organizations:', error);
        return false;
    }
}

/**
 * Create single organization
 *
 * @param org
 * @returns {Promise<*|boolean>}
 */
async function createOrganization(org) {
    try {
        const payload = {
            name: org.name,
            type: 'organization'
        };
        const response = await request
            .post(`${apiUrl}/contact`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            .disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send(payload);
        return response.body?.success?.id;
    } catch (error) {
        console.error('Failed to create organization:', error);
        return false;
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
 * Update single contact by uuid
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
        console.error('Failed to update contact:', error);
        return false;  // Return false if the API call fails
    }
}

// Run our main handler
exports.handler();
