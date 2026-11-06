import { manageTabPage } from "../../manage-page.js";

// « Mon espace » → « Captures », one capture opened (see ../../manage-page.js).
const page = manageTabPage("captures");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
