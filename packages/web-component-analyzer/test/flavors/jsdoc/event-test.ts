import { analyzeTextWithCurrentTsModule } from "../../helpers/analyze-text-with-current-ts-module.js";
import { getCurrentTsModule, tsTest } from "../../helpers/ts-test.js";

tsTest("jsdoc: Discovers custom events with @fires", t => {
	const {
		results: [result]
	} = analyzeTextWithCurrentTsModule(`
	/**
	 * @element
	 * @fires my-event - This is a comment
	 */
	 class MyElement extends HTMLElement {
	 }
	 `);

	const { events } = result.componentDefinitions[0].declaration!;

	t.is(events.length, 1);
	t.is(events[0].name, "my-event");
	t.is(events[0].jsDoc?.description, "This is a comment");
});

tsTest("jsdoc: Discovers the detail type of custom events with @fires", t => {
	const ts = getCurrentTsModule();
	const {
		results: [result],
		program
	} = analyzeTextWithCurrentTsModule(`
	/**
	 * @element
	 * @fires {string} my-event
	 * @fires my-second-event {number}
	 */
	 class MyElement extends HTMLElement {
	 }
	 `);

	const { events } = result.componentDefinitions[0].declaration!;
	const myEvent = events.find(e => e.name === "my-event")!;
	const mySecondEvent = events.find(e => e.name === "my-second-event")!;
	t.truthy(myEvent.type!(program.getTypeChecker()).flags & ts.TypeFlags.String);
	t.truthy(mySecondEvent.type!(program.getTypeChecker()).flags & ts.TypeFlags.Number);
});

tsTest("jsdoc: Resolves recovered event types through the active program", t => {
	const {
		results: [result],
		program
	} = analyzeTextWithCurrentTsModule([
		{
			fileName: "component.ts",
			includeLib: true,
			text: `
				/** @element @fires {CustomEvent<string>} changed */
				class MyElement extends HTMLElement {}
			`,
		},
	]);

	const event = result.componentDefinitions[0]!.declaration!.events[0]!;

	const type = event.type!(program.getTypeChecker());
	t.true((type.flags & getCurrentTsModule().TypeFlags.Any) === 0);
	t.is(type.symbol?.name, "CustomEvent");
});

tsTest("jsdoc: Keeps an unresolved recovered event as a type hint", t => {
	const {
		results: [result]
	} = analyzeTextWithCurrentTsModule(`
		/**
		 * @element
		 * @fires {MissingEvent} changed
		 */
		class MyElement extends HTMLElement {}
	`);

	const event = result.componentDefinitions[0]!.declaration!.events[0]!;

	t.is(event.name, "changed");
	t.is(event.typeHint, "MissingEvent");
	t.is(event.type, undefined);
});

tsTest("jsdoc: Discovers events declared with @fires that includes extra jsdoc information", t => {
	const {
		results: [result]
	} = analyzeTextWithCurrentTsModule(`
	/**
	 * @element
	 * @fires InputSwitch#[CustomEvent]input-switch-check-changed Fires when check property changes
	 */
	 class MyElement extends HTMLElement {
	 }
	 `);

	const { events } = result.componentDefinitions[0].declaration!;

	t.is(events.length, 1);
	t.is(events[0].name, "input-switch-check-changed");
	t.is(events[0].jsDoc?.description, "Fires when check property changes");
});

tsTest("jsdoc: Discovers and correctly parses event types", t => {
	const {
		results: [result],
		program
	} = analyzeTextWithCurrentTsModule({
		includeLib: true,
		fileName: "file.ts",
		text: `
	/**
	 * @element
	 * @fires {MouseEvent} mouse-move
	 * @fires {CustomEvent} custom-event-1
	 * @fires {CustomEvent<string>} custom-event-2
	 * @fires {Event} my-event
	 */
	 class MyElement extends HTMLElement {
	 }
		type ExpectedMouseEvent = MouseEvent;
		type ExpectedCustomEvent = CustomEvent<any>;
		type ExpectedEvent = Event;
	 `
	});

	const { events } = result.componentDefinitions[0].declaration!;
		const checker = program.getTypeChecker();
		const sourceFile = program.getSourceFile("file.ts")!;
		const typeAliases = sourceFile.statements.filter(getCurrentTsModule().isTypeAliasDeclaration);
		const getExpectedType = (name: string) => {
			const alias = typeAliases.find(alias => alias.name.text === name)!;
			return checker.getTypeAtLocation(alias.type);
		};

		const assertEvent = (name: string, typeName: string, expectedTypeName: string) => {
		const event = events.find(e => e.name === name);
		if (event == null) {
			t.fail(`Couldn't find event with name: ${name}`);
			return;
		}

			const type = event.type!(checker);
			if (name === "custom-event-1" || name === "custom-event-2") {
				t.true((type.flags & getCurrentTsModule().TypeFlags.Any) === 0);
				t.is(type.symbol?.name, "CustomEvent");
			}
			else {
				t.is(checker.typeToString(type), typeName);
			}

			t.truthy(
				checker.isTypeAssignableTo(type, getExpectedType(expectedTypeName)),
				`${name}: ${checker.typeToString(type)} is not assignable to ${expectedTypeName}`,
			);
	};

	t.is(events.length, 4);

		assertEvent("mouse-move", "MouseEvent", "ExpectedMouseEvent");
		assertEvent("custom-event-1", "CustomEvent<any>", "ExpectedCustomEvent");
		assertEvent("custom-event-2", "CustomEvent<string>", "ExpectedCustomEvent");
		assertEvent("my-event", "Event", "ExpectedEvent");
});
