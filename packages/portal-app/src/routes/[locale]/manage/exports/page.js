import { manageTabPage } from "../manage-page.js";

// « Mon espace » → « Exports » (see ../manage-page.js).
const page = manageTabPage("exports");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
