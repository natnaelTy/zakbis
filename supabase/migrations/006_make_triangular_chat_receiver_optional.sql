-- Allow triangular chats to be created before the receiver joins.
ALTER TABLE triangular_chats
  ALTER COLUMN receiver_id DROP NOT NULL;
