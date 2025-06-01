import mongoose, { Schema, Document } from 'mongoose';
import { IParentDocument } from '../types/parentDocument';

export interface IParentDocumentModel extends IParentDocument, Document {}

const ParentDocumentSchema: Schema = new Schema(
  {
    documentId: { type: String, required: true, unique: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

export const ParentDocumentModel = mongoose.model<IParentDocumentModel>(
  'ParentDocument',
  ParentDocumentSchema
);
