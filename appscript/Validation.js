/**
 * @module Validation
 * @description Centralized validation logic including external Dleaders List checking.
 */

/**
 * Calculates the Levenshtein distance between two strings,
 * and returns a similarity percentage (0.0 to 1.0) based on
 * the length of the longest string.
 *
 * @param {string} a - The first string.
 * @param {string} b - The second string.
 * @returns {number} The similarity percentage (e.g., 0.95 for 95% match).
 */
function calculateSimilarity(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase().trim().replace(/\s+/g, ' ');
    b = b.toLowerCase().trim().replace(/\s+/g, ' ');

    if (a === b) return 1.0;
    if (a.length === 0) return 0;
    if (b.length === 0) return 0;

    const matrix = [];

    // Initialize the first row and column
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return 1.0 - (distance / maxLen);
}

/**
 * Determines the most recent validation sheet based on month name chronological order.
 * @returns {Object} { sheetObj: Sheet, name: string, id: number }
 */
function getActiveValidationSheetInfo() {
    const ss = SpreadsheetApp.openById(DLEADERS_SPREADSHEET_ID);
    const sheets = ss.getSheets();

    const monthOrder = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
    };

    let latestSheet = null;
    let maxMonthIndex = 0;

    for (const s of sheets) {
        const sheetName = s.getName().trim().toLowerCase();
        const monthIndex = monthOrder[sheetName];
        if (monthIndex && monthIndex > maxMonthIndex) {
            maxMonthIndex = monthIndex;
            latestSheet = s;
        }
    }

    const sheet = latestSheet || sheets[0];
    return {
        sheetObj: sheet,
        name: sheet.getName(),
        id: sheet.getSheetId()
    };
}

/**
 * Fetches the Dleaders List from the external Google Sheet and caches it.
 * Uses CacheService for 1 hour to prevent hitting the external spreadsheet
 * API quotas on every booking submission.
 *
 * @returns {Object[]} Array of relevant leader names objects {firstName, lastName, nickName}.
 */
function fetchAndCacheDleadersList() {
    const cache = CacheService.getScriptCache();
    const cachedData = cache.get("DLEADERS_LIST");
    if (cachedData) {
        return JSON.parse(cachedData);
    }

    try {
        const activeInfo = getActiveValidationSheetInfo();
        const sheet = activeInfo.sheetObj;
        const data = sheet.getDataRange().getValues();

        if (data.length < 2) return [];

        const headers = data[0].map(h => String(h).trim().toLowerCase());
        const firstNameIdx = headers.indexOf('first_name');
        const lastNameIdx = headers.indexOf('last_name');
        const nickNameIdx = headers.indexOf('nick_name');

        if (firstNameIdx === -1 || lastNameIdx === -1) {
            throw new Error("Could not find 'First Name' or 'Last Name' columns in the external Dleaders List.");
        }

        const parsedData = [];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            const firstName = String(row[firstNameIdx] || "").trim().toLowerCase();
            const lastName = String(row[lastNameIdx] || "").trim().toLowerCase();
            if (!firstName || !lastName) continue;

            const nickName = nickNameIdx !== -1 ? String(row[nickNameIdx] || "").trim().toLowerCase() : "";

            parsedData.push({
                firstName: firstName,
                lastName: lastName,
                nickName: nickName
            });
        }

        // Cache for 5 minutes (300 seconds) to balance performance vs testing reality
        cache.put("DLEADERS_LIST", JSON.stringify(parsedData), 300);
        return parsedData;

    } catch (err) {
        Logger.log("Fetching Dleaders List failed: " + err.message);
        throw new Error("Unable to fetch the Dleaders List for validation: " + err.message);
    }
}

/**
 * Tests a given input First/Nick + Last name against the cached list
 * using a 95% similarity fuzzy match.
 *
 * @param {Object[]} listData - The cached array of valid leaders.
 * @param {string} inputFirst - The user-submitted first name.
 * @param {string} inputLast - The user-submitted last name.
 * @returns {boolean} True if the name passes the 95% threshold check against the list.
 */
function isNameInDleadersList(listData, inputFirst, inputLast) {
    if (!inputFirst || !inputLast) return false;

    // Normalize user input
    const submittedFirstLast = (inputFirst + " " + inputLast).toLowerCase().trim().replace(/\s+/g, ' ');

    for (const leader of listData) {
        const correctFirstLast = leader.firstName + " " + leader.lastName;
        const correctNickLast = leader.nickName ? (leader.nickName + " " + leader.lastName) : null;

        const simFirst = calculateSimilarity(submittedFirstLast, correctFirstLast);
        if (simFirst >= 0.95) return true;

        if (correctNickLast) {
            const simNick = calculateSimilarity(submittedFirstLast, correctNickLast);
            if (simNick >= 0.95) return true;
        }
    }

    return false;
}

/**
 * High-level orchestration function called prior to booking creation.
 * Validates the Reserver's name against the external DLeaders list.
 *
 * @param {string} reserverFirst - The user's first name.
 * @param {string} reserverLast - The user's last name.
 * @returns {Object} { passed: boolean, reason?: string }
 */
function validateNamesAgainstList(reserverFirst, reserverLast) {
    try {
        const listData = fetchAndCacheDleadersList();

        // Check standard user (reserver)
        const reserverPasses = isNameInDleadersList(listData, reserverFirst, reserverLast);
        if (!reserverPasses) {
            return {
                passed: false,
                reason: `Reserver '${reserverFirst} ${reserverLast}' does not match the CCF Manila Dleaders List.`
            };
        }

        return { passed: true };

    } catch (err) {
        Logger.log("Validation framework encountered an error: " + err.message);
        return { passed: false, reason: "System error: " + err.message };
    }
}
