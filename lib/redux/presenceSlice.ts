import { createSlice, PayloadAction } from "@reduxjs/toolkit";

/**
 * Store presence information for any user.
 * The key is the user id, the value contains online flag and lastSeen timestamp.
 */
export interface PresenceInfo {
  online: boolean;
  lastSeen: string; // ISO string
}

export interface PresenceState {
  map: Record<string, PresenceInfo>;
}

const initialState: PresenceState = {
  map: {},
};

export const presenceSlice = createSlice({
  name: "presence",
  initialState,
  reducers: {
    setPresence: (state, action: PayloadAction<{ userId: string; info: PresenceInfo }>) => {
      const { userId, info } = action.payload;
      state.map[userId] = info;
    },
    removePresence: (state, action: PayloadAction<string>) => {
      delete state.map[action.payload];
    },
  },
});

export const { setPresence, removePresence } = presenceSlice.actions;
export default presenceSlice.reducer;
