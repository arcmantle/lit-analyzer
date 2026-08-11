import { ComponentDeclaration, ComponentDefinition } from '@arcmantle/web-component-analyzer';

import { isRuleEnabled, LitAnalyzerRuleId } from './lit-analyzer-config.js';
import { LitAnalyzerContext } from './lit-analyzer-context.js';
import { HtmlDocument } from './parse/document/text-document/html-document/html-document.js';
import { HtmlNodeAttrAssignment } from './types/html-node/html-node-attr-assignment-types.js';
import { HtmlNodeAttr } from './types/html-node/html-node-attr-types.js';
import { HtmlNode, HtmlNodeKind } from './types/html-node/html-node-types.js';
import { RuleDiagnostic } from './types/rule/rule-diagnostic.js';
import { RuleModule, RuleModuleImplementation, RuleModulePhase } from './types/rule/rule-module.js';
import { RuleModuleContext } from './types/rule/rule-module-context.js';

export interface ReportedRuleDiagnostic {
	source:     LitAnalyzerRuleId;
	diagnostic: RuleDiagnostic;
}

export type RuleTiming = Map<LitAnalyzerRuleId, number>;

export class RuleCollection {

	private rules: RuleModule[] = [];

	push(...rule: RuleModule[]): void {
		this.rules.push(...rule);

		// Sort rules by most important first
		this.rules.sort((ruleA, ruleB) => (getPriorityValue(ruleA) > getPriorityValue(ruleB) ? -1 : 1));
	}

	private invokeRules<VisitFunctionName extends keyof RuleModuleImplementation>(
		functionName: VisitFunctionName,
		parameter: Parameters<NonNullable<RuleModuleImplementation[VisitFunctionName]>>[0],
		report: (diagnostic: ReportedRuleDiagnostic) => void,
		baseContext: LitAnalyzerContext,
		timings?: RuleTiming,
		phase?: RuleModulePhase,
	): boolean {
		let shouldBreak = false;

		const { config, htmlStore, program, definitionStore, dependencyStore, documentStore, logger, ts } = baseContext;

		let currentRuleId: LitAnalyzerRuleId | undefined = undefined;

		const context: RuleModuleContext = {
			config,
			htmlStore,
			program,
			definitionStore,
			dependencyStore,
			documentStore,
			logger,
			ts,
			file: baseContext.currentFile,
			report(diagnostic: RuleDiagnostic): void {
				if (currentRuleId != null)
					report({ diagnostic, source: currentRuleId });

				shouldBreak = true;
			},
			break(): void {
				shouldBreak = true;
			},
		};

		for (const rule of this.rules) {
			if (baseContext.isCancellationRequested) {
				shouldBreak = true;
				break;
			}

			if ((rule.meta?.phase ?? 'default') !== phase)
				continue;

			if (isRuleEnabled(context.config, rule.id)) {
				const func = rule[functionName];
				if (func != null) {
					currentRuleId = rule.id;
					const startTime = timings == null ? undefined : performance.now();

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					func(parameter as any, context);
					if (startTime != null)
						timings!.set(rule.id, (timings!.get(rule.id) ?? 0) + performance.now() - startTime);
				}
			}

			if (shouldBreak)
				break;
		}

		return shouldBreak;
	}

	getDiagnosticsFromDeclaration(declaration: ComponentDeclaration, baseContext: LitAnalyzerContext): ReportedRuleDiagnostic[] {
		const file = baseContext.currentFile;

		const diagnostics: ReportedRuleDiagnostic[] = [];

		this.invokeRules('visitComponentDeclaration', declaration, d => diagnostics.push(d), baseContext);

		for (const member of declaration.members) {
			if (member.node.getSourceFile() === file)
				this.invokeRules('visitComponentMember', member, d => diagnostics.push(d), baseContext);
		}

		return diagnostics;
	}

	getDiagnosticsFromDefinition(definition: ComponentDefinition, baseContext: LitAnalyzerContext): ReportedRuleDiagnostic[] {
		const file = baseContext.currentFile;

		const diagnostics: ReportedRuleDiagnostic[] = [];

		if (definition.sourceFile === file)
			this.invokeRules('visitComponentDefinition', definition, d => diagnostics.push(d), baseContext);


		return diagnostics;
	}

	getDiagnosticsFromDocument(
		htmlDocument: HtmlDocument,
		baseContext: LitAnalyzerContext,
		timings?: RuleTiming,
	): ReportedRuleDiagnostic[] {
		const diagnostics: ReportedRuleDiagnostic[] = [];
		const expensiveAssignments: HtmlNodeAttrAssignment[] = [];

		const iterateNodes = (nodes: HtmlNode[]) => {
			for (const childNode of nodes) {
				if (baseContext.isCancellationRequested)
					return;

				// Don't check SVG yet. We don't yet have all the data for it, and it hasn't been tested fully.
				if (childNode.kind === HtmlNodeKind.SVG)
					continue;


				this.invokeRules('visitHtmlNode', childNode, d => diagnostics.push(d), baseContext, timings);

				const iterateAttrs = (attrs: HtmlNodeAttr[]) => {
					for (const attr of attrs) {
						if (baseContext.isCancellationRequested)
							return;

						this.invokeRules('visitHtmlAttribute', attr, d => diagnostics.push(d), baseContext, timings);

						const assignment = attr.assignment;
						if (assignment != null) {
							const shouldSkipExpensiveRules = this.invokeRules(
								'visitHtmlAssignment',
								assignment,
								d => diagnostics.push(d),
								baseContext,
								timings,
								'default',
							);
							if (!shouldSkipExpensiveRules)
								expensiveAssignments.push(assignment);
						}
					}
				};

				iterateAttrs(childNode.attributes);

				iterateNodes(childNode.children);
			}
		};

		iterateNodes(htmlDocument.rootNodes);
		for (const assignment of expensiveAssignments) {
			if (baseContext.isCancellationRequested)
				break;

			if (assignment != null)
				this.invokeRules('visitHtmlAssignment', assignment, d => diagnostics.push(d), baseContext, timings, 'expensive');
		}

		return diagnostics;
	}

}

function getPriorityValue(rule: RuleModule): number {
	if (rule.meta?.priority != null) {
		switch (rule.meta?.priority) {
		case 'low':
			return 0;
		case 'medium':
			return 1;
		case 'high':
			return 2;
		}
	}

	return 0;
}
