import { manageTabPage } from "../manage-page.js";

// « Mon espace » → « Sessions » (see ../manage-page.js).
const page = manageTabPage("sessions");
export const createManagePage = page.createManagePage;
export const generateMetadata = page.generateMetadata;
export default createManagePage();
