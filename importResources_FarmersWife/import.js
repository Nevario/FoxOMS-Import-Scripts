'use strict'
const csvtojson = require("csvtojson");
const fs = require('fs');
const request = require('superagent');
const Throttle = require('superagent-throttle');
const csvFilePath = 'private/farmerswife-resources-export.csv';
const apiKey = 'YOUR_API_KEY_HERE';
const apiUrl = 'https://api.sonderplan.com/v2';

const newCount = {
    resourceGroups: 0,
    resourceEquip: 0,
    contacts: 0,
    resourcePeople: 0
}

// Set up the throttle plugin
const throttle = new Throttle({
    active: true,        // set false to pause queue
    rate: 2,             // how many requests can be sent every `ratePer`
    ratePer: 1000,       // number of ms in which `rate` requests may be sent
    concurrent: 1        // how many requests can be sent concurrently
});

exports.handler = async () => {
    console.log('Starting handler');
    try {
        const jsonArray = await csvtojson().fromFile(csvFilePath);

        const resourceGroups = [];
        const peopleContacts = [];
        const resourceEquip = [];

        for (const line of jsonArray) {
            // Resource Person
            if(line['Type'] === 'Resources') {
                const contact = {
                    name: line['Name'],
                    type: 'person',
                    client: false,
                    parent_name: line['Object Classes (Parent Group)']
                }
                peopleContacts.push(contact);
            // Room
            } else if(line['Type'] === 'System') {
                const resource = {
                    name: line['Name'],
                    description: line['Room No.'],
                    type_id: 3,
                    parent_name: line['Object Classes (Parent Group)']
                }
                resourceEquip.push(resource);
            }

            if(!resourceGroups.some(group => group.name === line['Object Classes (Parent Group)'])) {
                resourceGroups.push({
                    name: line['Object Classes (Parent Group)'],
                    type_id: 4
                });
            }
        }

        const serverResourceGroups = await createResourceGroups(resourceGroups);
        await createResourceEquipment(resourceEquip, serverResourceGroups);
        const serverContacts = await createContacts(peopleContacts);
        await createResourcePeople(serverContacts, serverResourceGroups);

        console.log(`Created ${newCount.resourceGroups} resource groups, ${newCount.resourceEquip} resource equipment, ${newCount.contacts} contacts and ${newCount.resourcePeople} resource people`)
    } catch (error) {
        console.error('Error in handler:', error);
    }
}

/**
 * Create Resource Groups
 *
 * @param resourceGroups
 * @returns {Promise<*>}
 */
async function createResourceGroups(resourceGroups){
    const existingGroups = await getExistingResourceGroups();

    // Update resourceGroups by adding id from existingGroups if the name matches
    for (const group of resourceGroups) {
        const existingGroup = existingGroups.find(eg => eg.name === group.name);
        if (existingGroup) {
            group.id = existingGroup.id;  // Add the id from existingGroups to resourceGroups
        } else {
            newCount.resourceGroups++;
            const newResourceGroupId = await createResource(group);
            group.id = parseInt(newResourceGroupId);
        }
    }

    return resourceGroups;
}

/**
 * Create Resource Equipment
 *
 * @param resourceEquipment
 * @param resourceGroups
 * @returns {Promise<void>}
 */
async function createResourceEquipment(resourceEquipment, resourceGroups) {
    console.log('Resource Groups', resourceGroups)
    const existingEquipResources = await getExistingEquipResources();

    for (const equipment of resourceEquipment) {
        const existingEquip = existingEquipResources.find(er => er.name === equipment.name);
        if (existingEquip) {
            equipment.id = existingEquip.id;
        } else {
            newCount.resourceEquip++;
            const equipParentGroup = resourceGroups.find(rg => rg.name === equipment.parent_name);

            if(equipParentGroup) {
                equipment.parent_id = equipParentGroup.id
            }

            const newRoomId = await createResource(equipment);
            equipment.id = parseInt(newRoomId);
        }
    }

    return resourceEquipment;
}

/**
 * Create Contacts
 *
 * @param contacts
 * @returns {Promise<*>}
 */
async function createContacts(contacts){
    const existingContacts = await getExistingContacts();

    for (const contact of contacts) {
        const existingContact = existingContacts.find(ec => ec.name === contact.name);

        if(existingContact) {
            contact.id = existingContact.id;
        } else {
            newCount.contacts++;
            const newContactId = await createContact(contact);
            contact.id = parseInt(newContactId);
        }
    }

    return contacts;
}

/**
 *
 * @param contacts
 * @param resourceGroups
 * @returns {Promise<*>}
 */
async function createResourcePeople(contacts, resourceGroups) {
    const existingPeopleResources = await getExistingPeopleResources();

    for (const contact of contacts) {
        const existingPersonResource = existingPeopleResources.find(epr => epr.name === contact.name);

        if(existingPersonResource) {
            contact.linked_resource_id = existingPersonResource.id;
        } else {
            const newResource = {
                name: contact.name,
                type_id: 2,
                type_person_id: contact.id
            }

            const parentGroup = resourceGroups.find(rg => rg.name === contact.parent_name);

            if(parentGroup) {
                newResource.parent_id = parentGroup.id
            }

            newCount.resourcePeople++;
            const newResourceId = await createResource(newResource);
            contact.linked_resource_id = parseInt(newResourceId);
        }
    }

    return contacts;
}

/**
 * Pulls all resource groups from the server
 * @returns {Promise<*|boolean>}
 */
async function getExistingResourceGroups() {
    try {
        const response = await request
            .get(`${apiUrl}/resource?type_id=4&fields=id,name,type_id&limit=1000`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send();
        return response.body.data;
    } catch (error) {
        console.error(error.response.body);
        return false;  // Return false if the API call fails
    }
}

/**
 * Pulls all resource rooms from the server
 *
 * @returns {Promise<*|boolean>}
 */
async function getExistingEquipResources() {
    try {
        const response = await request
            .get(`${apiUrl}/resource?type_id=3&fields=id,name,type_id&limit=1000`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send();
        return response.body.data;
    } catch (error) {
        return false;  // Return false if the API call fails
    }
}

/**
 * Pulls all resource rooms from the server
 *
 * @returns {Promise<*|boolean>}
 */
async function getExistingPeopleResources() {
    try {
        const response = await request
            .get(`${apiUrl}/resource?type_id=2&fields=id,name,type_id,type_person_id&limit=1000`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send();
        return response.body.data;
    } catch (error) {
        return false;  // Return false if the API call fails
    }
}

/**
 * Pulls 1000 of previously added contacts
 *
 * @returns {Promise<*|boolean>}
 */
async function getExistingContacts() {
    try {
        const response = await request
            .get(`${apiUrl}/contact&fields=id,name,type,linked_resource_id&limit=1000`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send();
        return response.body.data;
    } catch (error) {
        return false;  // Return false if the API call fails
    }
}

/**
 * Creates the resource / resource group in the API
 *
 * @param singleResource
 * @returns {Promise<boolean|string>}
 */
async function createResource(singleResource) {
    try {
        console.log('resource', singleResource);
        const response = await request
            .post(`${apiUrl}/resource`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send(singleResource);
        return response.body.success.id;
    } catch (error) {
        console.error(`Failed to create new resource: ${singleResource.name}`, error);
        return false;  // Return false if the API call fails
    }
}

/**
 *
 * @param singleContact
 * @returns {Promise<*|boolean>}
 */
async function createContact(singleContact) {
    try {
        console.log('contact', singleContact);
        const response = await request
            .post(`${apiUrl}/contact`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
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
