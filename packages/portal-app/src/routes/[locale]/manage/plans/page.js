import { manageTabPage } from "../manage-page.js";

// « Mon espace » → « Plans » (see ../manage-page.js).
const page = manageTabPage("plans");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
