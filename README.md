# NinjaNerd Scraper
*more or less working as of 2024-03-25*


## Description
This is a scraping tool build with Typescript and Playwright in order to scrape the notes section off the NinjaNerd website.

I wanted to learn Typescript and Playwright, so I did this small project to introduce myself. This is a refactor of my[previous scraping attempt](https://github.com/HenryCodesGit/ninja-nerd-downloader) I did that had the same goal, but the previous work did all the scraping through Chrome Devtools, and then downloaded the Google Drive links through the Google Drive API

## Installation
1. Clone the repository into a local folder:
   ```
   git clone git@github.com:HenryCodesGit/ninjanerd-scraper.git
   ```
2. Install the packages necessary
   ```
   npm install
   ```

## Usage
1. Add a `.env` file in the root project directory and put your NinjaNerd login credentials
   ```
   NINJANERD_LOGIN = '[YOUR USERNAME HERE]'
   NINJANERD_PASSWORD = '[YOUR PASSWORD HERE]'
   ```
2. Run the script when ready
   ```
   node build/src/scraper.js
   ```
3. The scraper will automatically download the files and store them in the `downloads/` folder

## Troubleshooting
* The scraper skips downloading sections, categories, and lectures whenever it encounters an issue and logs the issue in the `errors.log` file. 
* The scraper tracks its progress inside an `errors.log` file in the root folder of the project, including the number of sections, categories, and lectures that have been completed. To restart where progress was left off, the following can be entered into the `.env` file:

  ```
  SUBJECT_START = [ENTER # HERE]
  CATEGORY_START = [ENTER # HERE]
  LECTURE_START = [ENTER # HERE]
  ```
  If not provided, defaults will be set to 0
* Currently the scraper logs an error when notes or illustrations are not found, but this doesn't necessarily mean there was an error in the scraping. I will need to add in an exception route for this later.
