'use strict'
const csvtojson = require("csvtojson");
const request = require('superagent');
const Throttle = require('superagent-throttle');
const csvFilePath = 'private/farmerswife-projects-export.csv';
const apiKey = 'API Authentication Token';
const apiUrl = 'https://api.sonderplan.com/v2';

const customFieldId = 'custom_field_XXXX'; // Specify custom field for tracking the Farmerswife ID

const newCount = {
    projects: 0,
    contacts: 0
}

// Set up the throttle plugin
const throttle = new Throttle({
    active: true,        // set false to pause queue
    rate: 2,             // how many requests can be sent every `ratePer`
    ratePer: 1000,       // number of ms in which `rate` requests may be sent
    concurrent: 1        // how many requests can be sent concurrently
});

/**
 * Main orchestration function
 *
 * @returns {Promise<void>}
 */
exports.handler = async () => {
    try {
        const jsonArray = await csvtojson().fromFile(csvFilePath);
        const projects = [];
        const clientContacts = [];

        for (const line of jsonArray) {
            const project = {
                name: line['Project Name'],
                code: line['Code'],
                client_name: line['Client'],
                color_background: '#e1d453'
            }

            project[customFieldId] = line['Farmerswife ID'];

            const clientContact = {
                name: line['Client']
            }

            projects.push(project);
            clientContacts.push(clientContact)
        }

        // Create and store the new clients
        const serverClientContacts = await createClientContacts(clientContacts);
        // Create the projects
        await createProjects(projects, serverClientContacts);

        console.log(`Created ${newCount.contacts} contacts, ${newCount.projects} projects`);

    } catch (error) {
        console.error('Error in handler:', error);
    }
}

/**
 * Creates the client contacts before we create projects, (so they can be added to the newly created projects)
 *
 * @param contacts
 * @returns {Promise<*>}
 */
async function createClientContacts(contacts){
    const existingClients = await getExistingClientContacts();

    for (const contact of contacts) {
        if(contact.name.length === 0) {
            continue;
        }
        const existingClient = existingClients.find(ec => ec.name === contact.name);
        if (existingClient) {
            contact.id = existingClient.id;
        } else {
            newCount.contacts++;
            contact.client = true;
            contact.type = 'organization';

            const newContactId = await createContact(contact);
            contact.id = parseInt(newContactId);
            existingClients.push(contact)
        }
    }

    return contacts;
}

/**
 * Create projects
 *
 * @param projects
 * @param clientContacts
 * @returns {Promise<*>}
 */
async function createProjects(projects, clientContacts) {
    const existingProjects = await getExistingProjects();

    for (const project of projects) {
        const existingProject = existingProjects.find(ep => ep.code === project.code);

        if(existingProject) {
            project.id = existingProject.id;
        } else {
            newCount.projects++;

            const projectClient = clientContacts.find(cc => cc.name === project.client_name);

            if(projectClient) {
                project.client = [{id: projectClient.id, type: 'organization'}];
            }

            const newProjectId = await createProject(project);
            project.id = parseInt(newProjectId);
        }
    }

    return projects;
}

/**
 * Retrieves existing client contacts from server
 *
 * @returns {Promise<*|boolean>}
 */
async function getExistingClientContacts() {
    try {
        const response = await request
            .get(`${apiUrl}/contact?fields=id,name,client,type&client=true&limit=1000`)
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
 * Retrieves existing projects from the server
 *
 * @returns {Promise<*|boolean>}
 */
async function getExistingProjects() {
    try {
        const response = await request
            .get(`${apiUrl}/project?fields=id,name,code&limit=1000`)
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
 * Create single contact
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

/**
 * Create single project
 *
 * @param singleProject
 * @returns {Promise<*|boolean>}
 */
async function createProject(singleProject) {
    try {
        console.log('project', singleProject);
        const response = await request
            .post(`${apiUrl}/project`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send(singleProject);
        return response.body.success.id;
    } catch (error) {
        console.error('Failed to create new project:', error);
        return false;  // Return false if the API call fails
    }
}

// Run our main handler
exports.handler();