// =============================================================================
// usePmsFirestore — All Firestore listeners in one hook with loading states
//
// Problem: 9 separate onSnapshot calls in the main component with no way
// to know when initial data has loaded, causing "empty state" flash.
//
// Solution: Single hook that tracks loading state per collection and
// exposes a combined `isLoading` flag for skeleton UI.
// =============================================================================

import { useEffect, useRef, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  PmsProduct,
  PmsRouting,
  PmsMachine,
  PmsPerson,
  PmsSkill,
  PmsDowntime,
  PmsJob,
  PmsPlan,
  PmsWorkingHours,
} from "../types/pms";
import { IST_TIMEZONE_OFFSET_MINUTES } from "../utils/pmsHelpers";
import { Order } from "@/lib/types";

type PmsFirestoreData = {
  products: PmsProduct[];
  routing: PmsRouting[];
  machines: PmsMachine[];
  people: PmsPerson[];
  skills: PmsSkill[];
  downtimes: PmsDowntime[];
  orders: Order[];
  jobs: PmsJob[];
  plans: PmsPlan[];
  workingHours: PmsWorkingHours;
  /** True until ALL collections have received their first snapshot. */
  isLoading: boolean;
};

const INITIAL_WORKING_HOURS: PmsWorkingHours = {
  startTime: "10:00",
  endTime: "20:00",
  timezoneOffsetMinutes: IST_TIMEZONE_OFFSET_MINUTES,
};

const TOTAL_COLLECTIONS = 10; // 9 collections + 1 settings doc

export const usePmsFirestore = (): PmsFirestoreData => {
  const [products, setProducts] = useState<PmsProduct[]>([]);
  const [routing, setRouting] = useState<PmsRouting[]>([]);
  const [machines, setMachines] = useState<PmsMachine[]>([]);
  const [people, setPeople] = useState<PmsPerson[]>([]);
  const [skills, setSkills] = useState<PmsSkill[]>([]);
  const [downtimes, setDowntimes] = useState<PmsDowntime[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [jobs, setJobs] = useState<PmsJob[]>([]);
  const [plans, setPlans] = useState<PmsPlan[]>([]);
  const [workingHours, setWorkingHours] = useState<PmsWorkingHours>(INITIAL_WORKING_HOURS);

  const loadedCountRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);

  const markLoaded = () => {
    loadedCountRef.current += 1;
    if (loadedCountRef.current >= TOTAL_COLLECTIONS) {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubProducts = onSnapshot(collection(db, "products"), (snap) => {
      setProducts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const unsubRouting = onSnapshot(collection(db, "routing"), (snap) => {
      setRouting(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const unsubMachines = onSnapshot(collection(db, "machines"), (snap) => {
      setMachines(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const unsubPeople = onSnapshot(collection(db, "people"), (snap) => {
      setPeople(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const unsubSkills = onSnapshot(collection(db, "machineSkills"), (snap) => {
      setSkills(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const unsubDowntime = onSnapshot(collection(db, "machineDowntime"), (snap) => {
      setDowntimes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const ordersQuery = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc"),
      limit(250)
    );
    const unsubOrders = onSnapshot(ordersQuery, (snap) => {
      setOrders(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as Order))
      );
      markLoaded();
    });

    const activeJobStatuses = ["WAITING", "PLANNED", "IN_PROGRESS", "DONE"];
    const jobsQuery = query(
      collection(db, "jobs"),
      where("status", "in", activeJobStatuses)
    );
    const unsubJobs = onSnapshot(jobsQuery, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const unsubPlans = onSnapshot(collection(db, "plan"), (snap) => {
      setPlans(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      markLoaded();
    });

    const unsubWorkingHours = onSnapshot(
      doc(db, "pmsSettings", "workingHours"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as any;
          setWorkingHours({
            startTime:
              typeof data?.startTime === "string" ? data.startTime : INITIAL_WORKING_HOURS.startTime,
            endTime:
              typeof data?.endTime === "string" ? data.endTime : INITIAL_WORKING_HOURS.endTime,
            timezoneOffsetMinutes: IST_TIMEZONE_OFFSET_MINUTES,
          });
        }
        markLoaded();
      }
    );

    return () => {
      unsubProducts();
      unsubRouting();
      unsubMachines();
      unsubPeople();
      unsubSkills();
      unsubDowntime();
      unsubOrders();
      unsubJobs();
      unsubPlans();
      unsubWorkingHours();
    };
  }, []);

  return {
    products,
    routing,
    machines,
    people,
    skills,
    downtimes,
    orders,
    jobs,
    plans,
    workingHours,
    isLoading,
  };
};