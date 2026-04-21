import { createSlice, PayloadAction } from "@reduxjs/toolkit";

type AuthUser = {
  id: string;
  email: string | null;
};

type AuthProfile = {
  fullName: string;
  role: string | null;
};

type AuthState = {
  user: AuthUser | null;
  profile: AuthProfile | null;
  hydrated: boolean;
};

const initialState: AuthState = {
  user: null,
  profile: null,
  hydrated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuthState(
      state,
      action: PayloadAction<{ user: AuthUser | null; profile?: AuthProfile | null }>,
    ) {
      state.user = action.payload.user;
      state.profile = action.payload.profile ?? null;
    },
    clearAuth(state) {
      state.user = null;
      state.profile = null;
    },
    setHydrated(state, action: PayloadAction<boolean>) {
      state.hydrated = action.payload;
    },
  },
});

export const { setAuthState, clearAuth, setHydrated } = authSlice.actions;
export default authSlice.reducer;