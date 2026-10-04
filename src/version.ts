declare const __TJU_VERSION__: string | undefined;

export const APP_VERSION: string =
	typeof __TJU_VERSION__ !== "undefined" && __TJU_VERSION__ ? __TJU_VERSION__ : "0.0.0-dev";
