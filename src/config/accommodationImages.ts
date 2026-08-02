import room1 from "../assets/img/accomodation_pictures/room1.JPG";
import room2 from "../assets/img/accomodation_pictures/room2.JPG";
import room3 from "../assets/img/accomodation_pictures/room3.JPG";
import room4 from "../assets/img/accomodation_pictures/room4.JPG";
import room5 from "../assets/img/accomodation_pictures/room5.JPG";
import room6 from "../assets/img/accomodation_pictures/room6.JPG";
import room7 from "../assets/img/accomodation_pictures/room7.JPG";
import room8 from "../assets/img/accomodation_pictures/room8.jpg";
import room9 from "../assets/img/accomodation_pictures/room9.JPG";
import room11 from "../assets/img/accomodation_pictures/room11.JPG";
import room12 from "../assets/img/accomodation_pictures/room12.JPG";
import room13 from "../assets/img/accomodation_pictures/room13.JPG";
import tent1 from "../assets/img/accomodation_pictures/tent1.JPG";
import tent2 from "../assets/img/accomodation_pictures/tent2.JPG";
import tent3 from "../assets/img/accomodation_pictures/tent3.JPG";
import tent4 from "../assets/img/accomodation_pictures/tent4.JPG";
import tent5 from "../assets/img/accomodation_pictures/tent5.JPG";
import tent6 from "../assets/img/accomodation_pictures/tent6.JPG";
import villa10 from "../assets/img/accomodation_pictures/villa10.JPG";

const ACCOMMODATION_IMAGES: Record<string, string> = {
  "bungalow-1": room1,
  "bungalow-2": room2,
  "bungalow-3": room3,
  "bungalow-4": room4,
  "bungalow-5": room5,
  "bungalow-6": room6,
  "bungalow-7": room7,
  "bungalow-8": room8,
  "bungalow-9": room9,
  "bungalow-11": room11,
  "bungalow-12": room12,
  "villa-10": villa10,
  "villa-13": room13,
  "room-13": room13,
  "tent-1": tent1,
  "tent-2": tent2,
  "tent-3": tent3,
  "tent-4": tent4,
  "tent-5": tent5,
  "tent-6": tent6,
  "yurt-1": tent1,
  "yurt-2": tent2,
  "yurt-3": tent3,
  "yurt-4": tent4,
  "yurt-5": tent5,
  "yurt-6": tent6,
};

export function accommodationImageFor(key: string): string | null {
  return ACCOMMODATION_IMAGES[key] ?? null;
}
