import { manageTabPage } from "../manage-page.js";

// « Mon espace » → « Réglages » (see ../manage-page.js).
const page = manageTabPage("settings");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
