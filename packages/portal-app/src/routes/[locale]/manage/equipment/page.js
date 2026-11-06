import { manageTabPage } from "../manage-page.js";

// « Mon espace » → « Matériel » (see ../manage-page.js).
const page = manageTabPage("equipment");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
