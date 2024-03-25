import fs from 'fs/promises';
import dotenv from 'dotenv'
import playwright from 'playwright';

// Get login credentials from .env file
dotenv.config();

const logFilePath = 'errors.log'
const downloadPath = './downloads'

// Getting password and username
const [username, password] = [process.env.NINJANERD_LOGIN, process.env.NINJANERD_PASSWORD];
if(username === undefined || password === undefined) throw new Error('Cannot continue, no username/password specified');

scrapeWebsite(downloadPath, 'https://www.ninjanerd.org', username, password)
    .then(()=>{
        process.exit();
    })
    .catch((e)=>{
        logToFile('Something went wrong that resulted in a top level error.')
        logToFile(e)
    })

async function scrapeWebsite(downloadPath: string, url : string, username : string, password: string, startI: number = 0, startJ: number = 0, startK: number = 0) : Promise<void> {

    // Launch browser
    await logToFile('Launching browser\n')
    const browser = await playwright.chromium.launch({headless: true});
    const context = await browser.newContext();

    await logToFile(`Navigating to ${url}\n`);
    const page = await context.newPage();
    await page.goto(url);

    await logToFile('Logging in\n');
    await page.getByRole('banner').getByRole('link', { name: 'Login' }).click();
    await page.getByLabel('Email').click();
    await page.getByLabel('Email').fill(username);
    await page.getByLabel('Password').click();
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();

    await logToFile('Navigating to notes page\n');
    await page.locator('#login-success').getByText('x').click();
    await page.getByRole('button', { name: /resources/i }).hover();
    await page.getByLabel(/resources/i).getByRole('link', { name: /notes/i }).click();

    await logToFile('Finding all subjects for notes\n');
    const sidebar = await page.locator('[role="list"].sidebar_list');

    // Wait for sidebar to finish loading sub-elements
    // Needed because the .all() method might run before the sidebar has finished populating its elements?
    await sidebar.waitFor();

    // Get all the list items for the sidebar
    const listItems = await sidebar.locator('[role="listitem"]').all();
    if(!listItems.length){
        await logToFile('[ERROR] There are either no subjects or there was an issue getting list of subjects to scrape\n',true)
    }

    for(let i = startI; i< listItems.length; i+=1){
        startI = 0;
        
        let subjectPage;
        let subjectPath;
        try {
            const item = listItems[i];
            const subject = await item.innerText();
            await logToFile(`\nScraping notes for subject: ${await subject}: ${i} / ${listItems.length-1}\n`);
    
            subjectPath = `${downloadPath}/${safeString(subject)}`;
            await logToFile(`Files will be saved in: ${subjectPath}`);
            
            const link = item.locator('a[sidebar-main="note"]');
            const href = await link.getAttribute('href');
            subjectPage = await context.newPage();
            await subjectPage.goto(`${url}${href}`);
        } catch (err : any) {
            const msg = '[ERROR] There was an issue navigating to the subject page. Skipping\n'
            await logToFile(msg)
            await logToFile(err.toString()+'\n')
            if(subjectPage !== undefined) await subjectPage.close();
            continue;
        }

        //On the new page, scrape all the lecture links
        const categories = await subjectPage.locator('.category-section').all();
        if(!categories.length){
            await logToFile('There are either no categories or there was an issue getting list of categories to scrape. Skipping subject',false)
            continue;
        }

        for(let j = startJ; j < categories.length; j+=1){
            startJ = 0;
            let lectures;
            let categoryPath;

            try {
                const category = categories[j];

                const title = await category.getByRole('heading').innerText(); //
                await logToFile(`\nScraping notes for category: ${title}\nSubjects: ${i} / ${listItems.length}\nCategories: ${j} / ${categories.length-1}\n`);
    
                categoryPath = `${subjectPath}/${safeString(title)}`;
                await logToFile(`Files will be saved in: ${categoryPath}`);
    
                 // Get and also wait for list to populate
                const categoryList = await category.getByRole('list');
                await categoryList.waitFor();

                lectures = await categoryList.getByRole('listitem').all();
                if(!lectures.length) throw new Error('No lectures found, or issue with the locating routine\n');

            } catch (err: any) {
                const msg = 'There was an issue getting the lectures for this category. Skipping category\n'
                await logToFile(msg,false)
                await logToFile(err.toString(), false)
                console.warn(msg);
                continue;
            }

            for(let k = startK; k < lectures.length; k++){
                startK = 0;
                const lecture = lectures[k];

                await logToFile(`\nScraping notes for lecture\nSubjects: ${i} / ${listItems.length}\nCategories: ${j} / ${categories.length-1}\nLectures: ${k} / ${lectures.length}\n`);
                
                let illustrationBlock: playwright.Locator;
                let lecturePath: string;
                let lecturePage: playwright.Page | undefined;
                try {
                    const lectureHref = await lecture.getByRole('link').getAttribute('href');
                    lecturePage = await context.newPage();
                    await lecturePage.goto(`${url}${lectureHref}`);
    
                    // Get the name of the lecture
                    const lectureName = await lecturePage.getByRole('heading',{level: 1}).innerText()
                    lecturePath = `${categoryPath}/${lectureName}`
                    await logToFile(`Lecture name: ${lectureName}\n`);
                    await logToFile(`Files will be saved in: ${lecturePath}\n`);
    
                    // Inside lecture page, lecture links are located in '.product-member-block
                    const lectureBlock = await lecturePage.locator('.product-member-block');
                    await lectureBlock.waitFor();

                    // Find any links to Google (they may or may not exist)
                    const lectureLinks = await lectureBlock.locator(`a[href*="drive.google"]`).all(); // Not auto downloaded
                    lectureLinks.forEach(async (link)=>{
                        await downloadFromLocatorLinks(context, lecturePath, lecturePage!, lectureLinks);
                    })
                    
                } catch (err: any) {
                    const msg = '[ERROR] There was an issue getting the notes for this lecture. Skipping lecture\n'
                    await logToFile(msg,false)
                    await logToFile(err.toString(), false)
                    if(lecturePage !== undefined) await lecturePage.close();
                    continue;
                }

                let illustrationPage;
                try{
                    await logToFile(`Attempting to download illustrations\n`);
                    illustrationBlock = await lecturePage.locator('[role="list"].lecture-ref-list')
                    //Need to wait for the list to load items before continuing
                    await illustrationBlock.waitFor();
                    const illustrationLink = await illustrationBlock.getByRole('listitem').locator('a[href*="illustration"]');
                    const illustrationHref = await illustrationLink.getAttribute('href');
                    illustrationPage = await context.newPage();
                    await illustrationPage.goto(`${url}${illustrationHref}`);
                    const illustrationBlock2 = await illustrationPage.locator('.product-member-block');
                    await illustrationBlock2.waitFor();

                    const illustrationLinks2 = await illustrationBlock2.locator(`a[href*="drive.google"]`).all();
                    await downloadFromLocatorLinks(context, lecturePath, illustrationPage, illustrationLinks2);
                    await illustrationPage.close()
                    await logToFile(`Illustrations downloaded\n`);
                } catch (err: any) {
                    const msg = '[ERROR] Something wrong happened when trying to scrape illustrations. Skipping illustrations download\n'
                    await logToFile(msg,false)
                    await logToFile(err.toString(), false)
                    if(illustrationPage !== undefined) await illustrationPage.close()
                    continue;
                }
                
                await lecturePage.close();
            }
            await logToFile(`\n---------------------Moving on to next category---------------------\n`,false)
        }
        
        await logToFile(`\n---------------------Moving on to next subject---------------------\n`,false)
        await subjectPage.close();
    }

    logToFile('\n No more items to download. Exiting')
}

async function downloadFromLocatorLinks(context: playwright.BrowserContext, path: string, currentPage: playwright.Page, locatorLinks : playwright.Locator[]){
    let downloadPromise;
    let gLink = await locatorLinks[0].getAttribute('href');
    if(gLink?.includes('drive.google.com/file')){
        const gPage = await context.newPage();
        try {
            await gPage.goto(gLink);
            downloadPromise = gPage.waitForEvent('download');
            await gPage.locator('[role="button"][aria-label="Download"]').click();
    
            const download = await downloadPromise;
            await download.saveAs(path + `/` + download.suggestedFilename());
        } catch (err : any){
            throw new Error(err);
        } finally {
            await gPage.close();
        }
    } else if (gLink?.includes('drive.google.com/uc')){
        downloadPromise = currentPage.waitForEvent('download');
        await locatorLinks[0].click();
        const download = await downloadPromise;
        await download.saveAs(path + `/` + download.suggestedFilename());
    } else {
        // Type of Google drive link that is not accounted for. Script will need updating
        throw new Error(`Link syntax not accounted for: ${gLink}`);
    }
}

function safeString(s : string){
    return s.replace(/[<>:"/\\|?*]/g, '_').toLowerCase();
}

async function logToFile(message: string, throwError: boolean = false){
    console.log(message);
    await fs.appendFile(logFilePath,message)
        .catch((error)=>{
            if(error) throw new Error(`There was an issue outputting the error to the following path: ${logFilePath}`)
        });

    if(throwError){
        throw new Error(message);
    }
}