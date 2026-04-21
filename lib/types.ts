export type UserRole = "sender" | "traveler" | "receiver";

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: UserRole;
  rating: number;
  verified: boolean;
}

export interface Trip {
  id: string;
  traveler: User;
  flightNumber: string;
  departureCity: string;
  arrivalCity: string;
  departureDate: string;
  availableWeight: number;
  pricePerKg: number;
  status: "open" | "in_progress" | "completed";
}

export interface DeliveryRequest {
  id: string;
  sender: User;
  receiver: User;
  itemDescription: string;
  weight: number;
  pickupCity: string;
  dropoffCity: string;
  status:
    | "pending"
    | "matched"
    | "picked_up"
    | "in_transit"
    | "arrived"
    | "delivered";
  tripId?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  timestamp: string;
}

export interface Chat {
  id: string;
  participants: User[];
  messages: Message[];
  deliveryRequestId?: string;
}
