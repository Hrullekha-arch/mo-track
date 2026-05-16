export const EMPTY_ROOM_KEY = "__EMPTY_ROOM__";

export const toStrictRoomKey = (name: unknown) => {
  const value = String(name ?? "").trim();
  return value ? value : EMPTY_ROOM_KEY;
};

export const normalizeStrictRoom = (name: unknown) =>
  String(name ?? "").trim().toLowerCase();

export const roomLabelFromKey = (key: string) =>
  key === EMPTY_ROOM_KEY ? "(empty)" : key;

export const getUniqueRoomKeys = (rooms: unknown[]) =>
  Array.from(new Set(rooms.map((room) => toStrictRoomKey(room))));

export const hasBlankRoomNames = (roomMap: Record<string, string>) =>
  Object.values(roomMap).some((room) => !String(room).trim());

export const getStrictRoomSetFromMap = (roomMap: Record<string, string>) =>
  new Set(
    Object.values(roomMap)
      .map((name) => normalizeStrictRoom(name))
      .filter(Boolean)
  );

export const areStrictRoomSetsEqual = (
  measurementRoomMap: Record<string, string>,
  selectionRoomMap: Record<string, string>
) => {
  const mSet = getStrictRoomSetFromMap(measurementRoomMap);
  const sSet = getStrictRoomSetFromMap(selectionRoomMap);
  if (mSet.size !== sSet.size) return false;
  for (const room of mSet) {
    if (!sSet.has(room)) return false;
  }
  return true;
};

export const getSelectedRoomMap = (
  roomMap: Record<string, string>,
  selectedMap: Record<string, boolean>
) =>
  Object.entries(roomMap).reduce((acc, [key, value]) => {
    if (selectedMap[key]) acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

export const getSelectedRoomNames = (
  roomMap: Record<string, string>,
  selectedMap: Record<string, boolean>
) =>
  Array.from(
    new Set(
      Object.entries(roomMap)
        .filter(([key]) => selectedMap[key])
        .map(([, value]) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );