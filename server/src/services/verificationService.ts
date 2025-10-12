import { addMinutes } from "date-fns";
import { cf } from "../utils/codeforces";
import { db, pool } from "../config/database";
import { queries } from "../utils/postgres";


const randomSampleProblem = () => {
  const problems = [
    [2040, "A"],
    [2038, "A"],
    [2035, "B"],
  ];
  const randomIndex = Math.floor(Math.random() * problems.length);
  return problems[randomIndex];
};

export const verificationService = {
  async initiateVerification(handle: string) {
    const userInfo = await cf.getUserInfo(handle);
    const submissions = await cf.getSubmissions(handle);

    let contestId = null;
    let index = null;

    if (submissions.length > 6) {
      const earliestSubmissions = submissions.slice(-6, -1);
      const randomIndex = Math.floor(
        Math.random() * earliestSubmissions.length
      );
      const submission = earliestSubmissions[randomIndex];

      if (submission) {
        contestId = submission.problem.contestId;
        index = submission.problem.index;
      }
    } else {
      [contestId, index] = randomSampleProblem();
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const user = await db.getUserByHandle(handle);
      if (!user) {
        const newUser = await db.query(queries.INSERT_USER, [handle], client);
        await db.query(
          queries.CREATE_VERIFICATION,
          [newUser[0].id, contestId, index],
          client
        );
      } else {
        const verifications = await db.getVerificationsByUserId(user.id);
        if (verifications.length > 0) {
          await db.query(
            queries.DELETE_VERIFICATIONS_BY_USER_ID,
            [user.id],
            client
          );
        }
        await db.query(
          queries.CREATE_VERIFICATION,
          [user.id, contestId, index],
          client
        );
      }

      await client.query("COMMIT");
      return { contestId, index };
    } catch (error) {
      console.log(error);
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },

  async checkVerification(handle: string) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const user = await db.getUserByHandle(handle);
      if (!user) {
        throw new Error("User not found");
      }

      const verifications = await db.getVerificationsByUserId(user.id);
      if (verifications.length === 0) {
        throw new Error("No verifications found for user");
      }

      const latestVerification = verifications[verifications.length - 1];
      const createdAt = latestVerification.created_at;
      const expiry = addMinutes(createdAt, 5);

      if (new Date() > expiry) {
        await db.query(queries.DELETE_VERIFICATIONS_BY_USER_ID, [user.id]);
        throw new Error("Verification expired, please try again.");
      }

      const submissions = await cf.getSubmissions(handle, 1, 10);
      const submission = submissions.find(
        (s) =>
          s.problem.contestId === latestVerification.contest_id &&
          s.problem.index === latestVerification.index &&
          s.verdict === "COMPILATION_ERROR" &&
          s.creationTimeSeconds >= createdAt.getTime() / 1000 &&
          s.creationTimeSeconds <= expiry.getTime() / 1000
      );

      if (submission) {
        await db.query(queries.VERIFY_USER, [user.id], client);
        await db.query(queries.DELETE_VERIFICATIONS_BY_USER_ID, [user.id]);
        await client.query("COMMIT");

        return { verified: true, user };
      } else {
        await db.query(queries.DELETE_VERIFICATIONS_BY_USER_ID, [user.id]);
        throw new Error("Submission not found or not valid. Please try again.");
      }
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};
