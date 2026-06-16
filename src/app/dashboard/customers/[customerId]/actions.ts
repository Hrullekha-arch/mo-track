"use server";
import { adminDb } from "@/lib/firebase-admin";

// ================= DELETE COLLECTION =================
async function deleteCollection(
  collectionRef: FirebaseFirestore.CollectionReference
) {
  const snapshot =
    await collectionRef.get();

  if (snapshot.empty) return;

  const batchSize = 20;

  const docs = snapshot.docs;

  for (
    let i = 0;
    i < docs.length;
    i += batchSize
  ) {
    const batch =
      adminDb.batch();

    docs
      .slice(i, i + batchSize)
      .forEach((doc) => {
        batch.delete(doc.ref);
      });

    await batch.commit();
  }
}

// ================= RECURSIVE DELETE =================
async function deleteDocumentRecursively(
  docRef: FirebaseFirestore.DocumentReference
) {
  // GET SUBCOLLECTIONS
  const subcollections =
    await docRef.listCollections();

  // DELETE SUBCOLLECTIONS
  for (const subcollection of subcollections) {
    const snapshot =
      await subcollection.get();

    for (const doc of snapshot.docs) {
      await deleteDocumentRecursively(
        doc.ref
      );
    }

    await deleteCollection(
      subcollection
    );
  }

  // DELETE MAIN DOC
  await docRef.delete();
}

// ================= MAIN ACTION =================
export async function deleteDealAction(
  dealId: string
): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    if (!dealId) {
      return {
        success: false,
        message:
          "Deal ID is required.",
      };
    }

    // ================= FIND DEAL =================
    const dealSnapshot =
      await adminDb
        .collectionGroup("deals")
        .where("dealId", "==", dealId)
        .limit(1)
        .get();

    if (dealSnapshot.empty) {
      return {
        success: false,
        message:
          "Deal not found.",
      };
    }

    const dealDoc =
      dealSnapshot.docs[0];

    const dealRef =
      dealDoc.ref;

    // ================= DELETE =================
    await deleteDocumentRecursively(
      dealRef
    );

    // OPTIONAL O2D DELETE
    await adminDb
      .collection("o2d")
      .doc(dealId)
      .delete()
      .catch(() => {});

    return {
      success: true,
      message:
        "Deal and subcollections deleted successfully.",
    };
  } catch (error: any) {
    console.error(
      "Delete deal error:",
      error
    );

    return {
      success: false,
      message:
        error?.message ||
        "Failed to delete deal.",
    };
  }
}

//=====================fetch dealData
export async function getDealData(dealId: string) {
    try {
        const dealsnapshot = await adminDb.collectionGroup("deals").where("dealId", "==", dealId).limit(1).get();

        if (dealsnapshot.empty) {
            return null;
        }
        const dealDoc = dealsnapshot.docs[0];
        const dealData = dealDoc.data();
        console.log("Fetched deal data:", dealData);
            const NormilizedealData = {
                DealName: dealData.dealName || "",
                DealAmount: dealData.dealAmount || 0,
                Salesman: dealData.assignedSalesPerson?.name || "",
                MeasurementRequired:dealData.measurementRequired || "",
                AdvanceForMeasurment:dealData.advanceForMeasurement || "",
            }
        return NormilizedealData;   
    } catch (error) {
        console.error("Error fetching deal data:", error);
        return null;    
    }
}
