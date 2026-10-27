import { test } from "node:test";
import assert from "node:assert/strict";
import { receiverPhotoSrc } from "./photos.ts";

const bucket = (p: string) => `https://cdn.example/receiver-photos/${p}`;
test("an uploaded photo is served from the bucket", () => assert.equal(receiverPhotoSrc("u1/1.jpg", bucket), "https://cdn.example/receiver-photos/u1/1.jpg"));
test("a Telegram or Google photo link is used as is", () => assert.equal(receiverPhotoSrc("https://t.me/i/userpic/320/a.jpg", bucket), "https://t.me/i/userpic/320/a.jpg"));
test("anything else that looks like a link is not trusted", () => assert.equal(receiverPhotoSrc("http://evil.example/a.jpg", bucket), null));
test("an https link from any other host is not trusted", () => assert.equal(receiverPhotoSrc("https://tracker.example/x.gif", bucket), null));
test("Google photo links are trusted", () => assert.equal(receiverPhotoSrc("https://lh3.googleusercontent.com/a/x=s96-c", bucket), "https://lh3.googleusercontent.com/a/x=s96-c"));
