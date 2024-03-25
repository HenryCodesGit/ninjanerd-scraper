"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const dotenv_1 = __importDefault(require("dotenv"));
const playwright_1 = __importDefault(require("playwright"));
// Get login credentials from .env file
dotenv_1.default.config();
const logFilePath = 'errors.log';
const downloadPath = './downloads';
// Getting password and username
const [username, password] = [process.env.NINJANERD_LOGIN, process.env.NINJANERD_PASSWORD];
if (username === undefined || password === undefined)
    throw new Error('Cannot continue, no username/password specified');
// Getting start indices from .env file
const SUBJECT_START = process.env.SUBJECT_START ? parseInt(process.env.SUBJECT_START) : 0;
const CATEGORY_START = process.env.CATEGORY_START ? parseInt(process.env.CATEGORY_START) : 0;
const LECTURE_START = process.env.LECTURE_START ? parseInt(process.env.LECTURE_START) : 0;
scrapeWebsite(downloadPath, 'https://www.ninjanerd.org', username, password, SUBJECT_START, CATEGORY_START, LECTURE_START)
    .then(() => {
    process.exit();
})
    .catch((e) => {
    logToFile('Something went wrong that resulted in a top level error.');
    logToFile(e);
});
function scrapeWebsite(downloadPath_1, url_1, username_1, password_1) {
    return __awaiter(this, arguments, void 0, function* (downloadPath, url, username, password, startI = 0, startJ = 0, startK = 0) {
        // Launch browser
        yield logToFile('Launching browser\n');
        const browser = yield playwright_1.default.chromium.launch({ headless: true });
        const context = yield browser.newContext();
        yield logToFile(`Navigating to ${url}\n`);
        const page = yield context.newPage();
        yield page.goto(url);
        yield logToFile('Logging in\n');
        yield page.getByRole('banner').getByRole('link', { name: 'Login' }).click();
        yield page.getByLabel('Email').click();
        yield page.getByLabel('Email').fill(username);
        yield page.getByLabel('Password').click();
        yield page.getByLabel('Password').fill(password);
        yield page.getByRole('button', { name: 'Login' }).click();
        yield logToFile('Navigating to notes page\n');
        yield page.locator('#login-success').getByText('x').click();
        yield page.getByRole('button', { name: /resources/i }).hover();
        yield page.getByLabel(/resources/i).getByRole('link', { name: /notes/i }).click();
        yield logToFile('Finding all subjects for notes\n');
        const sidebar = yield page.locator('[role="list"].sidebar_list');
        // Wait for sidebar to finish loading sub-elements
        // Needed because the .all() method might run before the sidebar has finished populating its elements?
        yield sidebar.waitFor();
        // Get all the list items for the sidebar
        const listItems = yield sidebar.locator('[role="listitem"]').all();
        if (!listItems.length) {
            yield logToFile('[ERROR] There are either no subjects or there was an issue getting list of subjects to scrape\n', true);
        }
        for (let i = startI; i < listItems.length; i += 1) {
            startI = 0;
            let subjectPage;
            let subjectPath;
            try {
                const item = listItems[i];
                const subject = yield item.innerText();
                yield logToFile(`\nScraping notes for subject: ${yield subject}: ${i} / ${listItems.length - 1}\n`);
                subjectPath = `${downloadPath}/${safeString(subject)}`;
                yield logToFile(`Files will be saved in: ${subjectPath}`);
                const link = item.locator('a[sidebar-main="note"]');
                const href = yield link.getAttribute('href');
                subjectPage = yield context.newPage();
                yield subjectPage.goto(`${url}${href}`);
            }
            catch (err) {
                const msg = '[ERROR] There was an issue navigating to the subject page. Skipping\n';
                yield logToFile(msg);
                yield logToFile(err.toString() + '\n');
                if (subjectPage !== undefined)
                    yield subjectPage.close();
                continue;
            }
            //On the new page, scrape all the lecture links
            const categories = yield subjectPage.locator('.category-section').all();
            if (!categories.length) {
                yield logToFile('There are either no categories or there was an issue getting list of categories to scrape. Skipping subject', false);
                continue;
            }
            for (let j = startJ; j < categories.length; j += 1) {
                startJ = 0;
                let lectures;
                let categoryPath;
                try {
                    const category = categories[j];
                    const title = yield category.getByRole('heading').innerText(); //
                    yield logToFile(`\nScraping notes for category: ${title}\nSubjects: ${i} / ${listItems.length}\nCategories: ${j} / ${categories.length - 1}\n`);
                    categoryPath = `${subjectPath}/${safeString(title)}`;
                    yield logToFile(`Files will be saved in: ${categoryPath}`);
                    // Get and also wait for list to populate
                    const categoryList = yield category.getByRole('list');
                    yield categoryList.waitFor();
                    lectures = yield categoryList.getByRole('listitem').all();
                    if (!lectures.length)
                        throw new Error('No lectures found, or issue with the locating routine\n');
                }
                catch (err) {
                    const msg = 'There was an issue getting the lectures for this category. Skipping category\n';
                    yield logToFile(msg, false);
                    yield logToFile(err.toString(), false);
                    console.warn(msg);
                    continue;
                }
                for (let k = startK; k < lectures.length; k++) {
                    startK = 0;
                    const lecture = lectures[k];
                    yield logToFile(`\nScraping notes for lecture\nSubjects: ${i} / ${listItems.length}\nCategories: ${j} / ${categories.length - 1}\nLectures: ${k} / ${lectures.length}\n`);
                    let illustrationBlock;
                    let lecturePath;
                    let lecturePage;
                    try {
                        const lectureHref = yield lecture.getByRole('link').getAttribute('href');
                        lecturePage = yield context.newPage();
                        yield lecturePage.goto(`${url}${lectureHref}`);
                        // Get the name of the lecture
                        const lectureName = yield lecturePage.getByRole('heading', { level: 1 }).innerText();
                        lecturePath = `${categoryPath}/${lectureName}`;
                        yield logToFile(`Lecture name: ${lectureName}\n`);
                        yield logToFile(`Files will be saved in: ${lecturePath}\n`);
                        // Inside lecture page, lecture links are located in '.product-member-block
                        const lectureBlock = yield lecturePage.locator('.product-member-block');
                        yield lectureBlock.waitFor();
                        // Find any links to Google (they may or may not exist)
                        const lectureLinks = yield lectureBlock.locator(`a[href*="drive.google"]`).all(); // Not auto downloaded
                        lectureLinks.forEach((link) => __awaiter(this, void 0, void 0, function* () {
                            yield downloadFromLocatorLinks(context, lecturePath, lecturePage, lectureLinks);
                        }));
                    }
                    catch (err) {
                        const msg = '[ERROR] There was an issue getting the notes for this lecture. Skipping lecture\n';
                        yield logToFile(msg, false);
                        yield logToFile(err.toString(), false);
                        if (lecturePage !== undefined)
                            yield lecturePage.close();
                        continue;
                    }
                    let illustrationPage;
                    try {
                        yield logToFile(`Attempting to download illustrations\n`);
                        illustrationBlock = yield lecturePage.locator('[role="list"].lecture-ref-list');
                        //Need to wait for the list to load items before continuing
                        yield illustrationBlock.waitFor();
                        const illustrationLink = yield illustrationBlock.getByRole('listitem').locator('a[href*="illustration"]');
                        const illustrationHref = yield illustrationLink.getAttribute('href');
                        illustrationPage = yield context.newPage();
                        yield illustrationPage.goto(`${url}${illustrationHref}`);
                        const illustrationBlock2 = yield illustrationPage.locator('.product-member-block');
                        yield illustrationBlock2.waitFor();
                        const illustrationLinks2 = yield illustrationBlock2.locator(`a[href*="drive.google"]`).all();
                        yield downloadFromLocatorLinks(context, lecturePath, illustrationPage, illustrationLinks2);
                        yield illustrationPage.close();
                        yield logToFile(`Illustrations downloaded\n`);
                    }
                    catch (err) {
                        const msg = '[ERROR] Something wrong happened when trying to scrape illustrations. Skipping illustrations download\n';
                        yield logToFile(msg, false);
                        yield logToFile(err.toString(), false);
                        if (illustrationPage !== undefined)
                            yield illustrationPage.close();
                        continue;
                    }
                    yield lecturePage.close();
                }
                yield logToFile(`\n---------------------Moving on to next category---------------------\n`, false);
            }
            yield logToFile(`\n---------------------Moving on to next subject---------------------\n`, false);
            yield subjectPage.close();
        }
        logToFile('\n No more items to download. Exiting');
    });
}
function downloadFromLocatorLinks(context, path, currentPage, locatorLinks) {
    return __awaiter(this, void 0, void 0, function* () {
        let downloadPromise;
        let gLink = yield locatorLinks[0].getAttribute('href');
        if (gLink === null || gLink === void 0 ? void 0 : gLink.includes('drive.google.com/file')) {
            const gPage = yield context.newPage();
            try {
                yield gPage.goto(gLink);
                downloadPromise = gPage.waitForEvent('download');
                yield gPage.locator('[role="button"][aria-label="Download"]').click();
                const download = yield downloadPromise;
                yield download.saveAs(path + `/` + download.suggestedFilename());
            }
            catch (err) {
                throw new Error(err);
            }
            finally {
                yield gPage.close();
            }
        }
        else if (gLink === null || gLink === void 0 ? void 0 : gLink.includes('drive.google.com/uc')) {
            downloadPromise = currentPage.waitForEvent('download');
            yield locatorLinks[0].click();
            const download = yield downloadPromise;
            yield download.saveAs(path + `/` + download.suggestedFilename());
        }
        else {
            // Type of Google drive link that is not accounted for. Script will need updating
            throw new Error(`Link syntax not accounted for: ${gLink}`);
        }
    });
}
function safeString(s) {
    return s.replace(/[<>:"/\\|?*]/g, '_').toLowerCase();
}
function logToFile(message_1) {
    return __awaiter(this, arguments, void 0, function* (message, throwError = false) {
        console.log(message);
        yield promises_1.default.appendFile(logFilePath, message)
            .catch((error) => {
            if (error)
                throw new Error(`There was an issue outputting the error to the following path: ${logFilePath}`);
        });
        if (throwError) {
            throw new Error(message);
        }
    });
}
