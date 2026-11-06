import { manageTabPage } from "../manage-page.js";

// « Mon espace » → « Galerie privée » (see ../manage-page.js).
const page = manageTabPage("portal");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
