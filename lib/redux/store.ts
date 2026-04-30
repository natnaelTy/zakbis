import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./features/auth/authSlice";
import { zakbisApi } from "./api";
import deliveryReducer from "./deliverySlice"; // new slice for delivery request form
import presenceReducer from "./presenceSlice"; // presence slice
import chatReducer from "./features/chat/chatSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [zakbisApi.reducerPath]: zakbisApi.reducer,
    delivery: deliveryReducer, // register delivery slice
    presence: presenceReducer, // register presence slice
    chat: chatReducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(zakbisApi.middleware),
  devTools: process.env.NODE_ENV !== "production",
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;