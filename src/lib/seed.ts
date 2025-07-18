
"use server";

import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { User } from "./types";

const ASSIGNMENTS_CONFIG = {
    "Sandhya": ["CP (PRADEEP)", "RK (RAJKUMAR)", "RB (Bhatiya)", "DS (DAYAL)", "RSB (RAJENDRA BISHT)", "ASB (ABHISHEK SINGH)", "RA (RAJEEV AGGARWAL)"],
    "Anjali": ["BTK (TAPESHWAR)", "IS (Isha Mam)", "ANVR (Anvar)", "AAS (SAHOO)", "NKD (NEERAJ)", "DK (DEEPAK SINHA)", "KD (DEVENDER)", "ASB (ABHISHEK SINGH)"],
    "Anju": ["CAY (ASHISH)", "BPS (PAWAN SHARMA)", "UMDP (UMESH)", "SHANTANU", "SD (SWETA)"],
    "Gargi": ["VD (Vishal Dubey)", "SONI (DEEPAK SONI)", "NK (NAND KISHOR)", "ASD (SAROJ DAS)", "AK (ABHISHEK CARPET)", "MU (MURARI)"]
};

export async function seedSalesmanAssignments() {
    const batch = writeBatch(db);

    const crmNames = Object.keys(ASSIGNMENTS_CONFIG);
    if (crmNames.length === 0) {
        throw new Error("No CRM users found in the configuration.");
    }
    
    // Fetch all CRM users from Firestore whose names match the keys in our config
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("designation", "==", "CRM"), where("name", "in", crmNames));
    const querySnapshot = await getDocs(q);

    const crmUsers = querySnapshot.docs.map(doc => doc.data() as User);
    
    // Create a map of CRM name to their user ID for easy lookup
    const crmNameToIdMap = new Map<string, string>();
    crmUsers.forEach(user => {
        crmNameToIdMap.set(user.name, user.id);
    });

    let assignmentsCount = 0;

    for (const [crmName, salesmen] of Object.entries(ASSIGNMENTS_CONFIG)) {
        const crmId = crmNameToIdMap.get(crmName);
        if (crmId) {
            salesmen.forEach(salesman => {
                const assignmentRef = doc(db, "salesmanCrmAssignments", salesman);
                batch.set(assignmentRef, { crmUserId: crmId });
                assignmentsCount++;
            });
        } else {
            console.warn(`CRM user "${crmName}" not found in Firestore. Skipping their assignments.`);
        }
    }

    if (assignmentsCount === 0) {
        throw new Error("No valid CRM users found matching the configuration. No assignments were made.");
    }

    await batch.commit();
}
