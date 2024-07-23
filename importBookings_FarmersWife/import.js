'use strict'
const csvtojson = require("csvtojson");
const moment = require('moment-timezone');
const request = require('superagent');
const Throttle = require('superagent-throttle');
const csvFilePath = 'private/farmerswife-bookings-export.csv';
const apiKey = 'API Authentication Token';
const apiUrl = 'https://api.sonderplan.com/v2';

const customFieldId = 'custom_field_XXXX'; // Specify custom field for tracking the Farmerswife ID

const newCount = {
    bookings: 0
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
        const bookings = [];

        for (const line of jsonArray) {
            const booking = {
                name: line['Booking Name'],
                client_name: line['Client'],
                project_code: line['Project Code'],
                start: convertToISO8601(line['Start Date'], line['Location'], true),
                end: convertToISO8601(line['End Date'], line['Location'], false),
                all_day: true,
            }

            booking[customFieldId] = line['Booking ID']

            bookings.push(booking);
        }

        await createBookings(bookings);

        console.log(`Created ${newCount.bookings} bookings`);

    } catch (error) {
        console.error('Error in handler:', error);
    }
}

/**
 * Used to convert the date strings to unix timestamps with appropriate offsets
 *
 * @param dateString
 * @param timezone
 * @param start
 * @returns {number}
 */
function convertToISO8601(dateString, timezone, start = true) {
    let tzString = '';

    // Convert the timezone eg, California (America/Los_Angeles)
    if(timezone === 'LA') {
        tzString = 'America/Los_Angeles';
    } else {
        tzString = 'America/New_York';
    }

    // Parse the input date
    let date = moment.tz(dateString, 'D/M/YYYY', tzString);

    // Check if the date was correctly parsed
    if (!date.isValid()) {
        throw new Error(`Invalid date format: ${dateString}`);
    }

    date.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });

    if(!start) {
        date.add(1, 'day');
    }

    // Format the date to ISO-8601
    return date.unix();
}

/**
 * Create bookings if not already existing on the server
 *
 * @param bookings
 * @returns {Promise<*>}
 */
async function createBookings(bookings) {
    const serverProjects = await getExistingProjects();
    const serverClients = await getExistingClientContacts();
    const serverBookings = await getExistingBookings();

    for (const booking of bookings) {
        const existingBooking = serverBookings.find(eb => eb[customFieldId] === booking[customFieldId]);

        if(existingBooking) {
            booking.id = existingBooking.id;
        } else {
            newCount.bookings++;

            const bookingClient = serverClients.find(sc => sc.name === booking.client_name);

            if(bookingClient) {
                booking.client = [{id:bookingClient.id, type: 'organization'}]
            }

            const bookingProject = serverProjects.find(sp => sp.code === booking.project_code);

            if(bookingProject) {
                booking.project = [{id:bookingProject.id}]
            }

            const newBookingId = await createBooking(booking);
            booking.id = parseInt(newBookingId);
        }
    }

    return bookings;
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
 * Retrieves existing bookings
 *
 * @returns {Promise<*|boolean>}
 */
async function getExistingBookings() {
    try {
        const response = await request
            .get(`${apiUrl}/booking?fields=id,name,client,project,${customFieldId}&limit=1000`)
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
 * Create single booking
 *
 * @param singleBooking
 * @returns {Promise<*|boolean>}
 */
async function createBooking(singleBooking) {
    try {
        console.log('booking', singleBooking);
        const response = await request
            .post(`${apiUrl}/booking`)
            .set('Authorization', 'Bearer ' + apiKey)
            .set('Accept', 'application/json')
            //.disableTLSCerts() //For development use only
            .use(throttle.plugin())  // Applying the throttle plugin
            .send(singleBooking);
        return response.body.success.id;
    } catch (error) {
        console.error('Failed to create new booking:', error);
        return false;  // Return false if the API call fails
    }
}

// Run our main handler
exports.handler();