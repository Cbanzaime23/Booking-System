// ============================================================================
// Controllers.gs — Web Request Handler
// ============================================================================
// Contains the doGet entry point that routes API requests to service functions.
// ============================================================================

/**
 * Main entry point for HTTP GET requests to this Web App.
 *
 * Parses the `action` query parameter and routes to the appropriate
 * handler function. The response is wrapped in a JSONP callback so
 * the frontend can consume it via `<script>` tag injection.
 *
 * Supported actions:
 *   fetch_all, create, cancel, move, block_date,
 *   fetch_user_bookings, export_user_data, delete_user_data
 *
 * @param {Object} e - The Apps Script event object containing query parameters.
 * @returns {TextOutput} JSONP-formatted response.
 */
function doGet(e) {
    const callback = e.parameter.callback;
    const action = e.parameter.action || 'create';
    let result;
    try {
        if (action === 'fetch_all') {
            result = handleFetchAllBookings();
        } else if (e.parameter.payload) {
            const payload = JSON.parse(e.parameter.payload);
            switch (action) {
                case 'create':
                    result = handleCreateBooking(payload);
                    break;
                case 'cancel':
                    result = handleCancelBooking(payload);
                    break;
                case 'move':
                    result = handleMoveBooking(payload);
                    break;
                case 'block_date':
                    result = handleBlockDate(payload);
                    break;
                case 'update_reservation_window':
                    result = handleUpdateReservationWindow(payload);
                    break;
                case 'verify_admin':
                    result = handleVerifyAdmin(payload);
                    break;
                case 'fetch_user_bookings':
                    result = handleFetchUserBookings(payload);
                    break;
                case 'export_user_data':
                    result = handleExportUserData(payload);
                    break;
                case 'delete_user_data':
                    result = handleDeleteUserData(payload);
                    break;
                case 'delete_block_date':
                    result = handleDeleteBlockedDate(payload);
                    break;
                default:
                    throw new Error("Invalid action specified.");
            }
        } else {
            throw new Error("Missing payload or invalid action.");
        }
    } catch (error) {
        Logger.log('Error in doGet: ' + error.toString());
        result = { success: false, message: error.message };
    }
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(result)})`)
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
