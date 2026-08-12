import { Notice } from "obsidian";
import { Plugin } from "obsidian";

export default class PeriodicTypesPlugin extends Plugin {
	onload() {
		new Notice("periodic-types: env ok");
		console.log("periodic-types onload");
	}
	onunload() {}
}
