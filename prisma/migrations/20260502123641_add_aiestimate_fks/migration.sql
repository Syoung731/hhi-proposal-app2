-- AddForeignKey
ALTER TABLE "AIEstimate" ADD CONSTRAINT "AIEstimate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIEstimate" ADD CONSTRAINT "AIEstimate_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
