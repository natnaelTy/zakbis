import { createSlice, PayloadAction, createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/lib/supabase/client";
import type { Message } from "@/components/chat/ChatRoom";

// Async thunk to fetch initial messages for a chat
export const fetchMessages = createAsyncThunk(
  "chat/fetchMessages",
  async (chatId: string, { rejectWithValue }) => {
    const response = await fetch(`/api/chats/${chatId}/messages`, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return rejectWithValue("Failed to load messages");
    const payload = await response.json();
    return payload?.data as Message[];
  }
);

export const chatSlice = createSlice({
  name: "chat",
  initialState: {
    messages: [] as Message[],
    loading: false as boolean,
    currentUser: null as string | null,
  },
  reducers: {
    addMessage: (state, action: PayloadAction<Message>) => {
      // avoid duplicates
      if (!state.messages.find((m) => m.id === action.payload.id)) {
        state.messages.push(action.payload);
        state.messages.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
    },
    setCurrentUser: (state, action: PayloadAction<string | null>) => {
      state.currentUser = action.payload;
    },
    clearChat: (state) => {
      state.messages = [];
      state.loading = false;
      state.currentUser = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMessages.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMessages.fulfilled, (state, action) => {
        state.messages = action.payload;
        state.loading = false;
      })
      .addCase(fetchMessages.rejected, (state) => {
        state.loading = false;
      });
  },
});

export const { addMessage, setCurrentUser, clearChat } = chatSlice.actions;
export default chatSlice.reducer;
