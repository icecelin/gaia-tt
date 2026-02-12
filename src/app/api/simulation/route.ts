import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { runSimulation } from '@/lib/simulation';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const years = parseInt(searchParams.get('years') || '30');

    console.log('🔍 Simulation requested for years:', years);

    // Validate years parameter - changed max from 100 to 30
    if (years < 5 || years > 30) {
      return NextResponse.json(
        { error: 'Years parameter must be between 5 and 30' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('tech_tree_db');

    // Fetch nodes and edges from MongoDB
    const nodesCollection = db.collection('nodes');
    const edgesCollection = db.collection('edges');

    const [nodes, edges] = await Promise.all([
      nodesCollection.find({}).toArray(),
      edgesCollection.find({}).toArray(),
    ]);

    // Prepare tech tree structure
    const techTree = {
      graph: {
        nodes: nodes.map(({ _id, ...rest }) => rest),
        edges: edges.map(({ _id, ...rest }) => rest),
      },
    };

    console.log('📊 Tech tree loaded:', {
      nodeCount: techTree.graph.nodes.length,
      edgeCount: techTree.graph.edges.length
    });

    // Run simulation
    const results = runSimulation(techTree, years);

    // DEBUG: Check the year range in results
    const impactYears = new Set<number>();
    Object.values(results.impactData).forEach((techData) => {
      Object.keys(techData).forEach((year) => impactYears.add(parseInt(year)));
    });
    const sortedImpactYears = Array.from(impactYears).sort((a, b) => a - b);

    console.log('✅ Simulation complete:', {
      requestedYears: years,
      expectedEndYear: 2026 + years,
      impactDataYearRange: {
        first: sortedImpactYears[0],
        last: sortedImpactYears[sortedImpactYears.length - 1],
        count: sortedImpactYears.length
      },
      technologiesCount: Object.keys(results.impactData).length
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error running simulation:', error);
    return NextResponse.json(
      { error: 'Failed to run simulation' },
      { status: 500 }
    );
  }
}