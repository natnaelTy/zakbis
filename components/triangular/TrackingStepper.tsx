"use client";

import React from "react";
import { Check, Plane, Package, Box, Truck, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type DeliveryStatus = 
  | "pending"
  | "matched"
  | "picked_up"
  | "in_transit"
  | "arrived"
  | "delivered";

type BuyMeStatus = 
  | "open"
  | "accepted"
  | "purchased"
  | "delivered";

interface TrackingStepperProps {
  status: DeliveryStatus | BuyMeStatus;
  deliveryType: "triangular" | "buy_me";
  className?: string;
}

export function TrackingStepper({ 
  status, 
  deliveryType, 
  className 
}: TrackingStepperProps) {
  // Define steps based on delivery type
  const steps = deliveryType === "triangular" 
    ? [
        { id: "pending", label: "Request Made", icon: Package, active: false },
        { id: "matched", label: "Traveler Found", icon: Truck, active: false },
        { id: "picked_up", label: "Picked Up", icon: Plane, active: false },
        { id: "in_transit", label: "In Transit", icon: Plane, active: false },
        { id: "arrived", label: "Arrived", icon: Box, active: false },
        { id: "delivered", label: "Delivered", icon: Check, active: false },
      ]
    : [
        { id: "open", label: "Request Posted", icon: Package, active: false },
        { id: "accepted", label: "Traveler Accepted", icon: Truck, active: false },
        { id: "purchased", label: "Purchased", icon: Box, active: false },
        { id: "delivered", label: "Delivered", icon: Check, active: false },
      ];

  const currentIndex = steps.findIndex((s) => s.id === status);

  return (
    <Card className={`border border-black/5 p-6 ${className}`}>
      <div className="space-y-6">
        <div className="flex items-center justify-between relative">
          {/* Progress Line */}
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-200 -z-0" />
          
          {/* Active Progress Line */}
          <div 
            className="absolute top-1/2 left-0 h-0.5 bg-black -z-0 transition-all duration-500"
            style={{ width: `${(currentIndex + 1) / steps.length * 100}%` }}
          />

          {steps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentIndex;
            const isActive = index === currentIndex;

            return (
              <div key={step.id} className="flex flex-col items-center gap-2 relative z-10">
                <div 
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    transition-all duration-300
                    ${isCompleted || isActive 
                      ? "bg-black text-white" 
                      : "bg-slate-100 text-slate-400 border border-slate-200"
                    }
                    ${isActive ? "ring-2 ring-black ring-offset-2" : ""}
                  `}
                >
                  {isCompleted ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    <Icon size={14} className={isActive ? "text-black" : "text-slate-400"} />
                  )}
                </div>
                <span 
                  className={`
                    text-xs font-medium transition-colors duration-300
                    ${isActive || isCompleted ? "text-black" : "text-slate-400"}
                  `}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current Status Label */}
        <div className="text-center">
          <h3 className="text-sm font-bold text-black">
            {steps[currentIndex]?.label}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {deliveryType === "triangular" 
              ? status === "delivered" 
                ? "Package successfully delivered!"
                : status === "pending"
                  ? "Waiting for traveler to match..."
                  : status === "matched"
                    ? "Traveler matched! Get ready for pickup."
                    : status === "picked_up"
                      ? "Package picked up, in transit!"
                      : status === "in_transit"
                        ? "Package in transit, arriving soon!"
                        : status === "arrived"
                          ? "Package has arrived, ready for delivery!"
                          : "Delivery completed!"
              : status === "delivered"
                ? "Item successfully delivered!"
                : status === "open"
                  ? "Waiting for a traveler to accept your request..."
                  : status === "accepted"
                    ? "Traveler accepted! Get ready for purchase."
                    : status === "purchased"
                      ? "Item purchased, getting ready to ship!"
                      : "Shopping trip completed!"
            }
          </p>
        </div>

        {/* Role-specific Steps */}
        {deliveryType === "triangular" && currentIndex >= 2 && (
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-black/5">
            <div className="text-center">
              <div className="text-xs font-semibold text-black mb-1">1. Sender</div>
              <div className="text-[10px] text-slate-500">Package Ready</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-black mb-1">2. Traveler</div>
              <div className="text-[10px] text-slate-500">In Transit</div>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-black mb-1">3. Receiver</div>
              <div className="text-[10px] text-slate-500">Ready to Receive</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Simple progress bar for Buy Me requests
export function BuyMeProgress({ 
  status, 
  className 
}: { 
  status: BuyMeStatus; 
  className?: string; 
}) {
  const steps = [
    { id: "open", label: "Posted" },
    { id: "accepted", label: "Accepted" },
    { id: "purchased", label: "Purchased" },
    { id: "delivered", label: "Delivered" },
  ];

  const currentIndex = steps.findIndex((s) => s.id === status);

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isActive = index === currentIndex;
          
          return (
            <div key={step.id} className="flex flex-col items-center flex-1 gap-1">
              <div 
                className={`
                  w-6 h-6 rounded-full flex items-center justify-center border
                  transition-all duration-300
                  ${isCompleted || isActive 
                    ? "bg-black border-black text-white" 
                    : "bg-white border-slate-200 text-slate-300"
                  }
                `}
              >
                {isCompleted ? (
                  <Check size={10} strokeWidth={3} />
                ) : (
                  <div className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-black" : ""}`} />
                )}
              </div>
              <span 
                className={`
                  text-[10px] font-medium
                  ${isActive || isCompleted ? "text-black" : "text-slate-400"}
                `}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TrackingStepper;