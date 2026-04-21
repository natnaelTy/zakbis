import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export type TripSearchItem = {
  id: string;
  flight_number: string;
  departure_city: string;
  destination_city: string;
  departure_date: string;
  available_weight: number;
  price_per_kg: number;
  profiles: {
    full_name: string;
    rating: number;
    verified: boolean;
  } | null;
};

export type TripDetailItem = TripSearchItem & {
  traveler_id: string;
  notes: string | null;
};

export type SearchTripsArgs = {
  from?: string;
  to?: string;
  date?: string;
  limit?: number;
};

export type CreateDeliveryRequestArgs = {
  tripId: string;
  itemDescription: string;
  weight: number;
  pickupCity: string;
  dropoffCity: string;
};

export type TravelerDeliveryRequestItem = {
  id: string;
  chat_id: string | null;
  item_description: string;
  weight: number;
  pickup_city: string;
  dropoff_city: string;
  status: "PENDING" | "MATCHED" | "PICKED_UP" | "IN_TRANSIT" | "ARRIVED" | "DELIVERED" | "CANCELLED";
  created_at: string;
  trip: {
    id: string;
    flight_number: string;
    departure_city: string;
    destination_city: string;
    departure_date: string;
    price_per_kg: number;
  };
  sender: {
    full_name: string;
  } | null;
  receiver: {
    full_name: string;
  } | null;
};

export type OwnerDeliveryRequestItem = {
  id: string;
  chat_id: string | null;
  item_description: string;
  weight: number;
  pickup_city: string;
  dropoff_city: string;
  status: "PENDING" | "MATCHED" | "PICKED_UP" | "IN_TRANSIT" | "ARRIVED" | "DELIVERED" | "CANCELLED";
  created_at: string;
  sender: {
    full_name: string;
  } | null;
  receiver: {
    full_name: string;
  } | null;
  trip: {
    id: string;
    flight_number: string;
    departure_city: string;
    destination_city: string;
    departure_date: string;
    traveler: {
      full_name: string;
    } | null;
  } | null;
};

export type DeliveryRequestDetail = {
  id: string;
  item_description: string;
  weight: number;
  pickup_city: string;
  dropoff_city: string;
  status: "PENDING" | "MATCHED" | "PICKED_UP" | "IN_TRANSIT" | "ARRIVED" | "DELIVERED" | "CANCELLED";
  created_at: string;
  updated_at: string;
  sender_id: string | null;
  receiver_id: string | null;
  trip_id: string | null;
  chat_id: string | null;
  current_user_id: string;
  is_traveler: boolean;
  sender: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rating: number;
    verified: boolean;
  } | null;
  receiver: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    rating: number;
    verified: boolean;
  } | null;
  trip: {
    id: string;
    flight_number: string;
    departure_city: string;
    destination_city: string;
    departure_date: string;
    available_weight: number;
    price_per_kg: number;
    status: string;
    traveler_id: string;
    traveler: {
      id: string;
      full_name: string;
      avatar_url: string | null;
      rating: number;
      verified: boolean;
    } | null;
  } | null;
};

export const zakbisApi = createApi({
  reducerPath: "zakbisApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  tagTypes: ["Trips", "TripDetail", "DeliveryRequest", "DeliveryRequestDetail"],
  endpoints: (builder) => ({
    searchTrips: builder.query<TripSearchItem[], SearchTripsArgs | void>({
      query: (args) => {
        const params = new URLSearchParams();
        const searchArgs = args ?? {};

        if (searchArgs.from) params.set("from", searchArgs.from);
        if (searchArgs.to) params.set("to", searchArgs.to);
        if (searchArgs.date) params.set("date", searchArgs.date);
        params.set("limit", String(searchArgs.limit ?? 20));

        return { url: `trips?${params.toString()}` };
      },
      transformResponse: (response: { data: TripSearchItem[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map((trip) => ({ type: "Trips" as const, id: trip.id })),
              { type: "Trips" as const, id: "LIST" },
            ]
          : [{ type: "Trips" as const, id: "LIST" }],
    }),
    getTripById: builder.query<TripDetailItem, string>({
      query: (tripId) => `trips/${tripId}`,
      transformResponse: (response: { data: TripDetailItem }) => response.data,
      providesTags: (_result, _error, tripId) => [{ type: "TripDetail", id: tripId }],
    }),
    createDeliveryRequest: builder.mutation<{ id: string }, CreateDeliveryRequestArgs>({
      query: (body) => ({
        url: "delivery-requests",
        method: "POST",
        body,
      }),
      transformResponse: (response: { data: { id: string } }) => response.data,
      invalidatesTags: [{ type: "Trips", id: "LIST" }],
    }),
    getTravelerDeliveryRequests: builder.query<TravelerDeliveryRequestItem[], void>({
      query: () => "delivery-requests?scope=traveler",
      transformResponse: (response: { data: TravelerDeliveryRequestItem[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map((item) => ({ type: "DeliveryRequest" as const, id: item.id })),
              { type: "DeliveryRequest" as const, id: "LIST" },
            ]
          : [{ type: "DeliveryRequest" as const, id: "LIST" }],
    }),
    getOwnerDeliveryRequests: builder.query<OwnerDeliveryRequestItem[], void>({
      query: () => "delivery-requests?scope=owner",
      transformResponse: (response: { data: OwnerDeliveryRequestItem[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map((item) => ({ type: "DeliveryRequest" as const, id: item.id })),
              { type: "DeliveryRequest" as const, id: "LIST" },
            ]
          : [{ type: "DeliveryRequest" as const, id: "LIST" }],
    }),
    acceptDeliveryRequest: builder.mutation<{ id: string; status: string; chat_id: string | null }, { requestId: string }>({
      query: (body) => ({
        url: "delivery-requests",
        method: "PATCH",
        body,
      }),
      transformResponse: (response: { data: { id: string; status: string; chat_id: string | null } }) => response.data,
      invalidatesTags: (_result, _error, args) => [
        { type: "DeliveryRequest", id: args.requestId },
        { type: "DeliveryRequest", id: "LIST" },
      ],
    }),
    ensureDeliveryChat: builder.mutation<{ chat_id: string }, { requestId: string }>({
      query: (body) => ({
        url: "delivery-requests/chat",
        method: "POST",
        body,
      }),
      transformResponse: (response: { data: { chat_id: string } }) => response.data,
      invalidatesTags: (_result, _error, args) => [
        { type: "DeliveryRequest", id: args.requestId },
        { type: "DeliveryRequest", id: "LIST" },
      ],
    }),
    // New: Get single delivery request detail
    getDeliveryRequestById: builder.query<DeliveryRequestDetail, string>({
      query: (requestId) => `delivery-requests/${requestId}`,
      transformResponse: (response: { data: DeliveryRequestDetail }) => response.data,
      providesTags: (_result, _error, requestId) => [
        { type: "DeliveryRequestDetail", id: requestId },
      ],
    }),
    // New: Advance delivery status
    advanceDeliveryStatus: builder.mutation<{ id: string; status: string }, string>({
      query: (requestId) => ({
        url: `delivery-requests/${requestId}/status`,
        method: "PATCH",
      }),
      transformResponse: (response: { data: { id: string; status: string } }) => response.data,
      invalidatesTags: (_result, _error, requestId) => [
        { type: "DeliveryRequestDetail", id: requestId },
        { type: "DeliveryRequest", id: requestId },
        { type: "DeliveryRequest", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useSearchTripsQuery,
  useLazySearchTripsQuery,
  useGetTripByIdQuery,
  useCreateDeliveryRequestMutation,
  useGetTravelerDeliveryRequestsQuery,
  useGetOwnerDeliveryRequestsQuery,
  useAcceptDeliveryRequestMutation,
  useEnsureDeliveryChatMutation,
  useGetDeliveryRequestByIdQuery,
  useAdvanceDeliveryStatusMutation,
} = zakbisApi;
