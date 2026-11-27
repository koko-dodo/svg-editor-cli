/** The plugin domain surface. Application/history/document ownership stays private. */
export { Shape } from "../model/Shape";
export type { ShapeStyle } from "../model/Shape";
export { ContainerShape } from "../model/ContainerShape";
export type { AttributeValue, Attributes, ShapeView, DocumentView, DocumentQuery } from "./Domain";
export type { MutationPort, AttributeMutation, EditingAction, AttributeAction } from "./Editing";
export type { FeedbackOwner, FeedbackContext, OperationFeedback, CommitPreparation } from "./Feedback";
export type { CommandOperation, CommandParameter, CommandResult } from "./CommandResult";
export type { SvgSelector, SvgElementData, ShapeCreateArguments, ShapeServices, ShapePresentation, ShapeProvider } from "./ShapeProvider";
export type { CommandToken, ExtensionOutput, RenderingServices, QueryCommandContext, EditCommandContext, CommandInvocation, Command } from "./Command";
export type { TreeDecorationContext, TreeDecorator } from "./TreeDecorator";
export type { AttributeRequest, AttributeMatchContext, AttributeHandler } from "./AttributeHandler";
export type { ContributionNames, RegistrationContext } from "./Registration";
