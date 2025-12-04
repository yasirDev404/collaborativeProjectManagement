import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
    title: {type: String, required: true},
    description: {type:String, required:false, default:""},
    projectId: {type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true},
    workspaceId: {type: mongoose.Schema.Types.ObjectId, ref: 'Workspace', required: true},
    status: {type:String, enum:['todo', 'in_progress', 'in_review', 'done'], default: 'todo'},
    priority: {type: String, enum:['low', 'medium', 'high', 'urgent'], default: 'medium'},
    assignedTo: {type: mongoose.Schema.ObjectId, ref:'User', required: true},
    createdBy: {type: mongoose.Schema.ObjectId, ref:'User', required: true},
    dueDate: {type:Date, required:false},
    estimatedHours: {type:Number, required: true},
    actualHours: {type:Number, required: false, default: null},
    attachments: {type: [String], required: false, default: []},
    completedAt: {type: Date, default: null},
});

const Task = mongoose.Model("Task", taskSchema);

export default Task;