'use client';

import { ROOMS_NAME } from '@/lib/constants';

export const log = (...args: any[]) => console.log('[QuotationBuilder]', ...args);
export const logError = (...args: any[]) => console.error('[QuotationBuilder]', ...args);

export type EnrichedProduct = {
  id: string;
  room: string;
  itemName: string;
  bcn: string;
  shadeNo: string;
  isBlind: boolean;
  width: string;
  height: string;
  noOfPannel?: string;
  qty: number;
  mrp: number;
  amount: number;
  normalizedType: NormalizedType;
  source: 'measurement' | 'selection' | 'merged';
  status?: 'complete' | 'attention';
  issues?: string[];
  raw: any;
};

export type NormalizedType =
  | 'fabric'
  | 'blind'
  | 'wallpaper'
  | 'stitching'
  | 'hardware'
  | 'service'
  | 'unknown';

export const detectItemType = (raw: any): NormalizedType => {
  if (!raw) return 'unknown';
  if (raw.isBlind || raw.blindType || raw.shadeNo || raw.noOfBlind || raw.type === 'blind') return 'blind';

  const src = String(raw.productSource || '').toLowerCase();
  const cat = String(raw.productCategory || '').toLowerCase();
  const grp = String(raw.group || '').toLowerCase();

  if (src.includes('fabric')) return 'fabric';
  if (src.includes('wall')) return 'wallpaper';
  if (cat.includes('stitch')) return 'stitching';
  if (grp.includes('hardware') || grp.includes('track')) return 'hardware';
  return 'unknown';
};

const normalizeRoomToken = (name: string = '') =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ROOM_ALIAS_MAP = (() => {
  const map = new Map<string, string>();
  ROOMS_NAME.forEach((room) => {
    const canonical = normalizeRoomToken(room.value);
    [room.value, room.label, room.label.replace(/\//g, ' '), room.value.replace(/_/g, ' ')].forEach((alias) => {
      const key = normalizeRoomToken(alias);
      if (key) map.set(key, canonical);
    });
  });
  return map;
})();

export const normalizeRoom = (name: string = '') => {
  const normalized = normalizeRoomToken(name);
  if (!normalized) return 'unassigned';
  return ROOM_ALIAS_MAP.get(normalized) ?? normalized;
};

const makeLocalId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const toNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const collectBcnsFromRooms = (rooms: any[] = []) => {
  const ids: string[] = [];
  rooms.forEach((room) => {
    (room?.items || []).forEach((item: any) => {
      if (item?.data?.bcn) ids.push(String(item.data.bcn).trim());
      if (item?.data?.shadeNo) ids.push(String(item.data.shadeNo).trim());
    });
  });
  return ids;
};

export const buildEnrichedFromProducts = (products: any[] = [], mrpMap: Record<string, any> = {}): EnrichedProduct[] =>
  products.map((p: any) => {
    const cleanBCN = String(p?.collectionBrand || p?.bcn || p?.BCN || p?.collectionCode || '').trim();
    const mrp = cleanBCN ? Number(mrpMap[cleanBCN]?.mrp || 0) : 0;
    const isBlind = Boolean(p?.isBlind || p?.blindType || p?.shadeNo || p?.noOfBlind || (p?.group && p.group.toLowerCase().includes('blind')));
    const itemName = isBlind
      ? p?.blindType || 'Blind'
      : p?.salesDescription?.trim?.() || p?.itemName || '-';
    const qty = isBlind ? toNumber(p?.noOfBlind || p?.quantity || 1) : toNumber(p?.quantity || 1);

    return {
      id: p?.id || makeLocalId(),
      room: p?.room || '',
      itemName,
      bcn: cleanBCN || '-',
      isBlind,
      shadeNo: isBlind ? String(p?.shadeNo || '-') : '-',
      qty,
      width: p?.width || '0',
      height: p?.height || '0',
      noOfPannel: p?.noOfPannel || p?.noOfPcs || '',
      mrp,
      amount: qty * mrp,
      status: isBlind ? (itemName !== '-' && p?.shadeNo ? 'complete' : 'attention') : itemName !== '-' && cleanBCN && qty && mrp ? 'complete' : 'attention',
      raw: p,
      normalizedType: detectItemType(p),
      source: 'selection',
      issues: [],
    };
  });

export const buildEnrichedFromRooms = (rooms: any[] = [], mrpMap: Record<string, any> = {}) => {
  const items: EnrichedProduct[] = [];
  rooms.forEach((room: any) => {
    const roomName = room?.roomName || 'Unnamed Room';
    (room?.items || []).forEach((entry: any) => {
      const isBlind = entry.type === 'blind';
      const rawData = entry.data || {};
      const bcn = isBlind ? String(rawData.shadeNo || '').trim() : String(rawData.bcn || '').trim();
      const mrp = bcn ? Number(mrpMap[bcn]?.mrp || 0) : 0;
      const qty = toNumber(rawData.qty || rawData.panels || rawData.noOfSeat || rawData.noOfSheet || 1);

      items.push({
        id: entry?.id || `${roomName}-item-${makeLocalId()}`,
        room: roomName,
        itemName: isBlind ? rawData.blindType || 'Blind' : rawData.name || entry.type || 'Measured Item',
        bcn: bcn || '-',
        isBlind,
        shadeNo: isBlind ? bcn : '-',
        qty,
        width: rawData.width || '0',
        height: rawData.height || '0',
        noOfPannel: rawData.panels || '',
        mrp,
        amount: qty * mrp,
        status: 'complete',
        raw: rawData,
        normalizedType: detectItemType(entry),
        source: 'measurement',
        issues: [],
      });
    });
  });
  return items;
};

export const buildMergedItems = (measurement: any, selection: any, mrpMap: Record<string, any>) => {
  const measurementItems = buildEnrichedFromRooms(measurement?.rooms || [], mrpMap);
  const selectionItems = buildEnrichedFromProducts(selection?.products || [], mrpMap);
  const allItems: EnrichedProduct[] = [];
  const allRoomNames = new Set([
    ...selectionItems.map((item) => normalizeRoom(item.room)),
    ...measurementItems.map((item) => normalizeRoom(item.room)),
  ]);

  allRoomNames.forEach((roomName) => {
    const selItemsInRoom = selectionItems.filter((item) => normalizeRoom(item.room) === roomName);
    const mesItemsInRoom = measurementItems.filter((item) => normalizeRoom(item.room) === roomName);

    if (selItemsInRoom.length > 0 && mesItemsInRoom.length > 0) {
      const matchedMeasurementIds = new Set<string>();
      selItemsInRoom.forEach((sItem) => {
        const measurementMatch =
          mesItemsInRoom.find((mItem) => !mItem.isBlind && !sItem.isBlind && !matchedMeasurementIds.has(mItem.id)) ||
          mesItemsInRoom.find((mItem) => mItem.isBlind === sItem.isBlind && !matchedMeasurementIds.has(mItem.id));

        if (measurementMatch) {
          matchedMeasurementIds.add(measurementMatch.id);
          allItems.push({
            ...sItem,
            ...measurementMatch,
            id: sItem.id,
            source: 'merged',
            issues: [],
            room: sItem.room,
            bcn: sItem.bcn,
            mrp: sItem.mrp,
            shadeNo: sItem.isBlind ? sItem.shadeNo || measurementMatch.shadeNo : '-',
            raw: { ...measurementMatch.raw, ...sItem.raw },
          });
        } else {
          allItems.push({ ...sItem, source: 'selection', status: 'attention', issues: ['Not measured yet'] });
        }
      });

      mesItemsInRoom.forEach((mItem) => {
        if (!matchedMeasurementIds.has(mItem.id)) {
          allItems.push({ ...mItem, source: 'measurement', status: 'attention', issues: ['Not in selection'] });
        }
      });
    } else if (selItemsInRoom.length > 0) {
      selItemsInRoom.forEach((sItem) => {
        allItems.push({ ...sItem, source: 'selection', status: 'attention', issues: ['Not measured yet'] });
      });
    } else if (mesItemsInRoom.length > 0) {
      mesItemsInRoom.forEach((mItem) => {
        allItems.push({ ...mItem, source: 'measurement', status: 'attention', issues: ['Not in selection'] });
      });
    }
  });

  return allItems;
};

export const groupByRoom = (list: EnrichedProduct[]) =>
  list.reduce((acc: Record<string, EnrichedProduct[]>, curr) => {
    const roomKey = curr.room || 'Unassigned';
    if (!acc[roomKey]) acc[roomKey] = [];
    acc[roomKey].push(curr);
    return acc;
  }, {});

export const calculateFabricQty = (i: EnrichedProduct) => {
  const heightinch = Number(i.height || 0) + 16;
  const heightCM = heightinch * 2.54;
  const vrCM = Number(i.raw?.verticalRepeat || 0);
  const panelQty = Number(i.noOfPannel || 1);

  if (!vrCM || vrCM === 0) return Math.ceil((heightCM / 100) * panelQty);
  const repeatCount = Math.max(1, Math.ceil(heightCM / vrCM));
  return Math.ceil(((repeatCount * vrCM) * panelQty) / 100);
};

export const getGstPercent = (item: EnrichedProduct) => {
  const group = String(item.raw?.group || item.raw?.itemType || '').toLowerCase();
  if (item.isBlind) return 18;
  if (group.includes('hardware')) return 18;
  return 5;
};

export const deriveRowAmounts = (item: EnrichedProduct, discountMap: Record<string, number>) => {
  const qty = item.isBlind ? item.qty : calculateFabricQty(item);
  const gross = qty * item.mrp;
  const discountPercent = discountMap[item.id] ?? 0;
  const discountAmount = gross * (discountPercent / 100);
  const net = gross - discountAmount;
  const taxPercent = getGstPercent(item);
  const gstAmount = net * (taxPercent / 100);
  const totalWithTax = net + gstAmount;

  return { qty, gross, discountAmount, net, discountPercent, taxPercent, gstAmount, totalWithTax };
};

export const formatCurrency = (value: number) =>
  Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
