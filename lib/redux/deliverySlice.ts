import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "./store";

// ---------------------------------------------------------------------------
// Async thunk – calls the POST /api/delivery-requests endpoint
// ---------------------------------------------------------------------------
export const createDeliveryRequest = createAsyncThunk(
  "delivery/createRequest",
  async (payload: {
    userId: string;
    pickup_city: string;
    dropoff_city: string;
    details?: string;
    budget: number;
  }) => {
    const res = await fetch("/api/delivery-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error ?? "Failed to create request");
    }
    return json.data; // newly created delivery record
  }
);

// ---------------------------------------------------------------------------
// Slice state – holds the form fields and request status
// ---------------------------------------------------------------------------
interface DeliveryState {
  pickup_city: string;
  dropoff_city: string;
  details: string;
  budget: string; // keep as string for easy binding to input value
  status: "idle" | "loading" | "succeeded" | "failed";
  error?: string;
}

const initialState: DeliveryState = {
  pickup_city: "",
  dropoff_city: "",
  details: "",
  budget: "",
  status: "idle",
};

export const deliverySlice = createSlice({
  name: "delivery",
  initialState,
  reducers: {
    setField: (state, action: PayloadAction<{ field: keyof DeliveryState; value: string }>) => {
      const { field, value } = action.payload;
      // @ts-ignore – dynamic key assignment
      state[field] = value as any;
    },
    resetForm: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(createDeliveryRequest.pending, (state) => {
        state.status = "loading";
        state.error = undefined;
      })
      .addCase(createDeliveryRequest.fulfilled, (state) => {
        state.status = "succeeded";
        // form will be cleared by the component after navigation
      })
      .addCase(createDeliveryRequest.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message;
      });
  },
});

export const { setField, resetForm } = deliverySlice.actions;

export const selectDelivery = (state: RootState) => state.delivery;

export default deliverySlice.reducer;
