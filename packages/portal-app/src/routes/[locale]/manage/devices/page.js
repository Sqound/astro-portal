import { manageTabPage } from "../manage-page.js";

// « Mon espace » → « Appareils » (see ../manage-page.js).
const page = manageTabPage("devices");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
